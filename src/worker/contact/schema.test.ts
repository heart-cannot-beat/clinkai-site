import { describe, expect, it } from 'vitest';
import { CONTACT_FIELDS, validateFields, type FieldSpec } from './schema';

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

describe('CONTACT_FIELDS', () => {
  it('字段名不重复，最多一个回复地址字段，而且它是邮箱类型', () => {
    const names = CONTACT_FIELDS.map((field) => field.name);
    const replyTo = CONTACT_FIELDS.filter((field: FieldSpec) => field.replyTo);

    expect(new Set(names).size).toBe(names.length);
    expect(replyTo.length).toBeLessThanOrEqual(1);
    expect(replyTo.every((field) => field.kind === 'email')).toBe(true);
  });
});
