import { describe, expect, it } from 'vitest';
import designHtml from '../../../design/screens/page-contact.html?raw';
import {
  buildContactFields,
  CONTACT_FIELDS,
  validateFields,
  type FieldSpec,
} from './schema';

// 校验器的测试用自己的字段表，字段按交接包对齐时这里不用跟着改
const FIELDS = [
  { name: 'who', kind: 'text', required: true, maxLength: 5 },
  { name: 'mail', kind: 'email', required: true, maxLength: 40, replyTo: true },
  { name: 'org', kind: 'text', required: false, maxLength: 10 },
  { name: 'note', kind: 'multiline', required: true, maxLength: 20 },
] as const satisfies readonly FieldSpec[];

function input(values: Record<string, unknown>): Record<string, unknown> {
  return {
    who: '林',
    mail: 'lin@pebblesound.example',
    note: '想聊聊',
    ...values,
  };
}

describe('validateFields', () => {
  it('通过时返回去掉首尾空白的值，丢掉没定义的字段', () => {
    const result = validateFields(
      input({ who: '  林  ', note: '第一行\r\n第二行', extra: '不要' }),
      FIELDS,
    );

    expect(result).toEqual({
      ok: true,
      values: {
        who: '林',
        mail: 'lin@pebblesound.example',
        note: '第一行\n第二行',
      },
    });
  });

  it('用户填的值碰巧和错误码同名时照常通过', () => {
    expect(
      validateFields(input({ org: 'required', note: 'invalid' }), FIELDS),
    ).toEqual({
      ok: true,
      values: {
        who: '林',
        mail: 'lin@pebblesound.example',
        org: 'required',
        note: 'invalid',
      },
    });
  });

  it('选填字段留空时不出现在结果里', () => {
    const result = validateFields(input({ org: '   ' }), FIELDS);

    expect(result.ok && 'org' in result.values).toBe(false);
  });

  it('必填字段缺失或只有空白时报 required', () => {
    const result = validateFields(
      input({ who: undefined, note: '  ' }),
      FIELDS,
    );

    expect(result).toEqual({
      ok: false,
      errors: { who: 'required', note: 'required' },
    });
  });

  it('按字符数（不是字节数）算长度，超长报 too_long', () => {
    expect(validateFields(input({ who: '一二三四五' }), FIELDS).ok).toBe(true);
    expect(validateFields(input({ who: '😀😀😀😀😀' }), FIELDS).ok).toBe(true);
    expect(validateFields(input({ who: '一二三四五六' }), FIELDS)).toEqual({
      ok: false,
      errors: { who: 'too_long' },
    });
  });

  it.each([
    'lin',
    'lin@',
    '@pebblesound.example',
    'lin @pebblesound.example',
    'a<b>@x.example',
  ])('邮箱格式不对（%s）时报 invalid', (mail) => {
    expect(validateFields(input({ mail }), FIELDS)).toEqual({
      ok: false,
      errors: { mail: 'invalid' },
    });
  });

  it('单行字段里有换行时报 invalid，多行字段允许换行', () => {
    expect(validateFields(input({ who: '林\n林' }), FIELDS)).toEqual({
      ok: false,
      errors: { who: 'invalid' },
    });
    expect(validateFields(input({ note: '一\n二' }), FIELDS).ok).toBe(true);
  });

  it('值不是字符串时报 invalid', () => {
    expect(validateFields(input({ who: 42, org: ['x'] }), FIELDS)).toEqual({
      ok: false,
      errors: { who: 'invalid', org: 'invalid' },
    });
  });

  it('不读原型链上的值', () => {
    const data = Object.create({ who: '林' }) as Record<string, unknown>;
    data.mail = 'lin@pebblesound.example';
    data.note = '想聊聊';

    expect(validateFields(data, FIELDS)).toEqual({
      ok: false,
      errors: { who: 'required' },
    });
  });
});

describe('validateFields：多选和单选', () => {
  const CHOICE_FIELDS = [
    {
      name: 'where',
      kind: 'choices',
      required: true,
      options: ['北', '南', '东'],
    },
    { name: 'size', kind: 'choice', required: false, options: ['小', '大'] },
  ] as const satisfies readonly FieldSpec[];

  it('多选收数组，去重后按选项表的顺序返回', () => {
    expect(
      validateFields({ where: ['东', '北', '东'] }, CHOICE_FIELDS),
    ).toEqual({ ok: true, values: { where: ['北', '东'] } });
  });

  it('多选只选了一个时，表单编码发来的是单个字符串，也收', () => {
    expect(validateFields({ where: ' 南 ' }, CHOICE_FIELDS)).toEqual({
      ok: true,
      values: { where: ['南'] },
    });
  });

  it.each([[undefined], [null], [[]], [''], ['  '], [['', ' ']]])(
    '多选必填：一个都没选（%j）时报 required',
    (where) => {
      expect(validateFields({ where }, CHOICE_FIELDS)).toEqual({
        ok: false,
        errors: { where: 'required' },
      });
    },
  );

  it.each([[['北', '西']], [['北', 3]], [42], [{ 0: '北' }], ['西']])(
    '多选里有选项表之外的值，或者值不是字符串（%j）时报 invalid',
    (where) => {
      expect(validateFields({ where }, CHOICE_FIELDS)).toEqual({
        ok: false,
        errors: { where: 'invalid' },
      });
    },
  );

  it('单选的值必须是选项之一', () => {
    const base = { where: ['北'] };

    expect(validateFields({ ...base, size: '大' }, CHOICE_FIELDS)).toEqual({
      ok: true,
      values: { where: ['北'], size: '大' },
    });
    for (const size of ['中', ['大'], 1]) {
      expect(validateFields({ ...base, size }, CHOICE_FIELDS)).toEqual({
        ok: false,
        errors: { size: 'invalid' },
      });
    }
  });

  it('选填的单选留空时不出现在结果里', () => {
    const result = validateFields({ where: ['北'], size: '' }, CHOICE_FIELDS);

    expect(result).toEqual({ ok: true, values: { where: ['北'] } });
  });
});

// 从设计稿的表单里读出控件的 name 和多选项，接口的字段表要和它对得上
function designForm() {
  const form = designHtml.slice(
    designHtml.indexOf('<form'),
    designHtml.indexOf('</form>'),
  );
  const names = [
    ...form.matchAll(/<(?:input|select|textarea)[^>]*\sname="([^"]+)"/g),
  ]
    .map((match) => match[1]!)
    .filter((name, index, all) => all.indexOf(name) === index);
  const checkboxes = (name: string) =>
    [
      ...form.matchAll(
        new RegExp(`type="checkbox" name="${name}" value="([^"]+)"`, 'g'),
      ),
    ].map((match) => match[1]!);
  return { names, checkboxes };
}

describe('CONTACT_FIELDS', () => {
  const design = designForm();

  it('设计稿的表单读得出来（防止读错文件导致空比空）', () => {
    expect(design.names).toEqual([
      'brand',
      'site',
      'market',
      'service',
      'budget',
      'contact',
      'note',
    ]);
  });

  it('字段名和顺序照设计稿的表单；月预算的分档还是【待填】，接口先不收 budget', () => {
    expect(CONTACT_FIELDS.map((field) => field.name)).toEqual(
      design.names.filter((name) => name !== 'budget'),
    );
  });

  it('月预算的分档补齐后，budget 是单选，选项是各档加「先聊聊再说」，位置照设计稿', () => {
    const fields = buildContactFields(['档一（示例）', '档二（示例）']);

    expect(fields.map((field) => field.name)).toEqual(design.names);
    expect(fields.find((field) => field.name === 'budget')).toMatchObject({
      kind: 'choice',
      options: ['档一（示例）', '档二（示例）', '先聊聊再说'],
    });
  });

  it.each(['market', 'service'])('%s 是多选，选项照抄设计稿', (name) => {
    const field = CONTACT_FIELDS.find((item) => item.name === name);

    expect(design.checkboxes(name).length).toBeGreaterThan(1);
    expect(field).toMatchObject({
      kind: 'choices',
      options: design.checkboxes(name),
    });
  });

  it('设计稿里只有「补充说明」标了选填，它是多行文字', () => {
    expect(designHtml).toContain('补充说明（选填）');
    expect(CONTACT_FIELDS.find((field) => field.name === 'note')).toMatchObject(
      { kind: 'multiline', required: false },
    );
  });

  it('字段名不重复，最多一个回复地址字段，而且它是邮箱类型', () => {
    const names = CONTACT_FIELDS.map((field) => field.name);
    const replyTo = CONTACT_FIELDS.filter(
      (field: FieldSpec) => 'replyTo' in field && field.replyTo,
    );

    expect(new Set(names).size).toBe(names.length);
    expect(replyTo.length).toBeLessThanOrEqual(1);
    expect(replyTo.every((field) => field.kind === 'email')).toBe(true);
  });
});
