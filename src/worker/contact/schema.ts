// 预约沟通页（P-04）表单的字段定义。接口只从这里读字段，别处不再写字段名。
//
// ⚠️ 占位字段：design/ 交接包还没到，下面的字段名、必填和长度上限都是临时的，
// 字段待按交接包里预约沟通页的表单对齐。对齐时改 CONTACT_FIELDS 就够了。

export type FieldKind = 'text' | 'email' | 'multiline';

export interface FieldSpec {
  /** 请求体里的键名，也用在发到收件邮箱的正文里 */
  readonly name: string;
  /** text 和 email 是单行；multiline 允许换行 */
  readonly kind: FieldKind;
  readonly required: boolean;
  /** 去掉首尾空白后的字符数上限（按 Unicode 码点算，不按字节） */
  readonly maxLength: number;
  /** 用这个字段的值做邮件的回复地址。最多一个字段，且必须是 email 类型 */
  readonly replyTo?: boolean;
}

export const CONTACT_FIELDS = [
  { name: 'name', kind: 'text', required: true, maxLength: 100 },
  {
    name: 'email',
    kind: 'email',
    required: true,
    maxLength: 254,
    replyTo: true,
  },
  { name: 'company', kind: 'text', required: false, maxLength: 100 },
  { name: 'message', kind: 'multiline', required: true, maxLength: 2000 },
] as const satisfies readonly FieldSpec[];

/** Turnstile 组件往表单里写 token 用的默认字段名。JSON 请求也用这个键。 */
export const TURNSTILE_FIELD = 'cf-turnstile-response';

export type FieldError = 'required' | 'too_long' | 'invalid';

export type ValidationResult =
  | { ok: true; values: Record<string, string> }
  | { ok: false; errors: Record<string, FieldError> };

// 和浏览器 <input type="email"> 用同一条规则（HTML 规范里的 valid email address），
// 这样前端放行的地址后端也放行。
const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

type FieldCheck = { error: FieldError } | { value: string } | null;

function checkField(field: FieldSpec, raw: unknown): FieldCheck {
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

/**
 * 按字段表校验请求体。只读字段表里有的键（不读原型链），其余键一律丢掉。
 * 通过时返回去掉首尾空白、统一换行符后的值；选填字段留空时不出现在结果里。
 */
export function validateFields(
  input: Record<string, unknown>,
  fields: readonly FieldSpec[],
): ValidationResult {
  const values: Record<string, string> = {};
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
