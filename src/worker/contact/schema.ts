// 预约沟通页（P-04）表单的字段定义。接口、页面和提交脚本都从这里读字段，别处不再写字段名。
// 字段名、顺序和多选项照 design/screens/page-contact.html 的表单；选项文字在 src/data/contact.ts。
//
// ⚠️ 暂定：哪些必填、各自的长度上限，交接包里没有，已在 Issue #15 里问设计侧。
// 下面先按「设计稿里只有补充说明标了选填，其余都必填」做，长度沿用 S-03 占位字段的量级。
// 答复到了只改 buildContactFields 里的 required 和 maxLength。

import {
  budgetOptions,
  CONTACT_TODO,
  MARKETS,
  SERVICES,
} from '../../data/contact';

export type FieldKind = 'text' | 'email' | 'multiline' | 'choices' | 'choice';

interface FieldBase {
  /** 请求体里的键名，也用在发到收件邮箱的正文里 */
  readonly name: string;
  readonly required: boolean;
}

export interface TextFieldSpec extends FieldBase {
  /** text 和 email 是单行；multiline 允许换行 */
  readonly kind: 'text' | 'email' | 'multiline';
  /** 去掉首尾空白后的字符数上限（按 Unicode 码点算，不按字节） */
  readonly maxLength: number;
  /** 用这个字段的值做邮件的回复地址。最多一个字段，且必须是 email 类型 */
  readonly replyTo?: boolean;
}

export interface ChoiceFieldSpec extends FieldBase {
  /** choices 可以选多个（必填时至少选一个）；choice 只能选一个 */
  readonly kind: 'choices' | 'choice';
  /** 只收这里列出的值 */
  readonly options: readonly string[];
}

export type FieldSpec = TextFieldSpec | ChoiceFieldSpec;

/** 多选字段的值是数组，其余是字符串 */
export type FieldValue = string | string[];

/**
 * 表单的字段表。月预算的分档是【待填】（design/copy.md）：
 * 没补齐（null）时页面上月预算整块隐藏，这里也不收 budget。
 */
export function buildContactFields(
  budgetTiers: readonly string[] | null,
): readonly FieldSpec[] {
  const budget = budgetOptions(budgetTiers);
  return [
    { name: 'brand', kind: 'text', required: true, maxLength: 100 },
    { name: 'site', kind: 'text', required: true, maxLength: 300 },
    { name: 'market', kind: 'choices', required: true, options: MARKETS },
    { name: 'service', kind: 'choices', required: true, options: SERVICES },
    ...(budget
      ? [
          {
            name: 'budget',
            kind: 'choice',
            required: true,
            options: budget,
          } as const,
        ]
      : []),
    { name: 'contact', kind: 'text', required: true, maxLength: 200 },
    { name: 'note', kind: 'multiline', required: false, maxLength: 2000 },
  ];
}

export const CONTACT_FIELDS = buildContactFields(CONTACT_TODO.budgetTiers);

export type FieldError = 'required' | 'too_long' | 'invalid';

export type ValidationResult =
  | { ok: true; values: Record<string, FieldValue> }
  | { ok: false; errors: Record<string, FieldError> };

// 和浏览器 <input type="email"> 用同一条规则（HTML 规范里的 valid email address），
// 这样前端放行的地址后端也放行。
const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

type FieldCheck = { error: FieldError } | { value: FieldValue } | null;

function checkText(field: TextFieldSpec, raw: unknown): FieldCheck {
  const missing = field.required ? { error: 'required' as const } : null;
  if (raw === undefined || raw === null) return missing;
  if (typeof raw !== 'string') return { error: 'invalid' };

  const value = raw.replace(/\r\n?/g, '\n').trim();
  if (value === '') return missing;
  if (Array.from(value).length > field.maxLength) return { error: 'too_long' };
  const singleLine = field.kind !== 'multiline';
  if (singleLine && value.includes('\n')) return { error: 'invalid' };
  const badEmail = field.kind === 'email' && !EMAIL_PATTERN.test(value);
  if (badEmail) return { error: 'invalid' };
  return { value };
}

function checkChoice(field: ChoiceFieldSpec, raw: unknown): FieldCheck {
  const missing = field.required ? { error: 'required' as const } : null;
  if (raw === undefined || raw === null) return missing;

  // 表单编码下只选一个时发来的是单个字符串，选多个才是数组
  const multiple = field.kind === 'choices';
  const items: unknown[] = multiple && Array.isArray(raw) ? raw : [raw];
  if (!items.every((item) => typeof item === 'string')) {
    return { error: 'invalid' };
  }

  const picked = new Set(
    (items as string[]).map((item) => item.trim()).filter(Boolean),
  );
  if (picked.size === 0) return missing;
  for (const item of picked) {
    if (!field.options.includes(item)) return { error: 'invalid' };
  }

  // 按选项表的顺序返回，邮件里读起来顺序固定
  const ordered = field.options.filter((option) => picked.has(option));
  return { value: multiple ? ordered : ordered[0]! };
}

function checkField(field: FieldSpec, raw: unknown): FieldCheck {
  return 'options' in field ? checkChoice(field, raw) : checkText(field, raw);
}

/**
 * 按字段表校验请求体。只读字段表里有的键（不读原型链），其余键一律丢掉。
 * 通过时返回去掉首尾空白、统一换行符后的值；选填字段留空时不出现在结果里。
 * 页面的提交脚本在发请求前也跑这一个函数，前后端的规则是同一份。
 */
export function validateFields(
  input: Record<string, unknown>,
  fields: readonly FieldSpec[],
): ValidationResult {
  const values: Record<string, FieldValue> = {};
  const errors: Record<string, FieldError> = {};

  for (const field of fields) {
    const raw = Object.hasOwn(input, field.name)
      ? input[field.name]
      : undefined;
    const result = checkField(field, raw);
    if (result === null) continue;
    if ('error' in result) errors[field.name] = result.error;
    else values[field.name] = result.value;
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, values };
}
