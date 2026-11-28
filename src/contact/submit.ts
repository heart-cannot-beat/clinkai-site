// 预约沟通表单的提交逻辑，不碰页面元素（页面那一半在 form.ts）。
// 状态码怎么对应到结果，照 docs/contact-api.md 的「响应」表。

import {
  validateFields,
  type FieldError,
  type FieldSpec,
} from '../worker/contact/schema';

/** 接口超过这个时间没回，就取消请求、按失败处理，免得按钮一直禁用 */
export const SUBMIT_TIMEOUT_MS = 20_000;

export type SubmitOutcome =
  | { kind: 'success' }
  /** 按字段标错。发请求前本地校验没过，或者接口回了 422 */
  | { kind: 'invalid'; fields: Record<string, FieldError> }
  /** 接口回了 429 */
  | { kind: 'rate_limited' }
  /** 发信失败、服务端出错、网络不通、超时 */
  | { kind: 'failed' }
  /** 没有发请求：上一次还没回来（submitting），或者已经提交成功过（success） */
  | { kind: 'duplicate'; of: 'submitting' | 'success' };

export interface SubmitterOptions {
  /** 接口地址 */
  endpoint: string;
  fields: readonly FieldSpec[];
  /** 测试里换成假的；默认用浏览器的 fetch */
  fetch?: typeof fetch;
}

const FIELD_ERRORS: readonly string[] = ['required', 'too_long', 'invalid'];

/** 从表单数据里取出字段表里的值：多选取全部勾选的值，其余取字符串；别的键丢掉 */
export function buildPayload(
  form: FormData,
  fields: readonly FieldSpec[],
): Record<string, string | string[]> {
  const text = (value: FormDataEntryValue | null) =>
    typeof value === 'string' ? value : '';
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      field.kind === 'choices'
        ? form.getAll(field.name).map(text)
        : text(form.get(field.name)),
    ]),
  );
}

/** 接口 422 响应里的字段错误：只认字段表里的字段和三种错误码 */
function serverFieldErrors(
  body: unknown,
  fields: readonly FieldSpec[],
): Record<string, FieldError> {
  const reported =
    typeof body === 'object' && body !== null
      ? (body as { fields?: unknown }).fields
      : undefined;
  if (typeof reported !== 'object' || reported === null) return {};

  const errors: Record<string, FieldError> = {};
  for (const field of fields) {
    const code = Object.hasOwn(reported, field.name)
      ? (reported as Record<string, unknown>)[field.name]
      : undefined;
    if (typeof code === 'string' && FIELD_ERRORS.includes(code)) {
      errors[field.name] = code as FieldError;
    }
  }
  return errors;
}

export function createSubmitter({
  endpoint,
  fields,
  fetch: send = globalThis.fetch,
}: SubmitterOptions) {
  let state: 'idle' | 'submitting' | 'success' = 'idle';

  async function request(
    values: Record<string, unknown>,
  ): Promise<SubmitOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
    try {
      const response = await send(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(values),
        signal: controller.signal,
      });
      if (response.status === 429) return { kind: 'rate_limited' };

      const body: unknown = await response.json();
      if (response.status === 422) {
        const errors = serverFieldErrors(body, fields);
        return Object.keys(errors).length > 0
          ? { kind: 'invalid', fields: errors }
          : { kind: 'failed' };
      }
      const ok =
        response.status === 200 &&
        typeof body === 'object' &&
        body !== null &&
        (body as { ok?: unknown }).ok === true;
      return ok ? { kind: 'success' } : { kind: 'failed' };
    } catch {
      // 网络不通、超时被取消、响应不是 JSON
      return { kind: 'failed' };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async submit(payload: Record<string, unknown>): Promise<SubmitOutcome> {
      if (state !== 'idle') return { kind: 'duplicate', of: state };

      const validation = validateFields(payload, fields);
      if (!validation.ok) return { kind: 'invalid', fields: validation.errors };

      state = 'submitting';
      const outcome = await request(validation.values);
      state = outcome.kind === 'success' ? 'success' : 'idle';
      return outcome;
    },
  };
}
