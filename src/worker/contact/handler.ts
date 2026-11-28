// POST /api/contact：预约沟通表单接口。
// 顺序：方法 → 配置 → 限流 → 读请求体 → 字段校验 → 发信。
// 不做防刷校验（用户 2026-11-28 决定先不用 Turnstile，见 Issue #15；原实现在 PR #7 的历史里），限流保留。
// 不存库；日志只记结果码，不记表单内容、联系方式和 IP。
// 状态码和响应体的约定见 docs/contact-api.md。

import type { EmailMessageBuilder, Env } from '../env';
import { readLimited } from '../read-limited';
import {
  CONTACT_FIELDS,
  validateFields,
  type FieldSpec,
  type FieldValue,
} from './schema';

export const CONTACT_PATH = '/api/contact';

/** 请求体上限。所有字段全部填满也不到这个数（handler.test.ts 里有测试盯着）。 */
export const MAX_BODY_BYTES = 16 * 1024;

/** 和 wrangler.jsonc 里限流的 period 一致 */
export const RETRY_AFTER_SECONDS = 60;

/** 发到收件邮箱的标题。只给内部看，不是站点文案。 */
export const EMAIL_SUBJECT = '官网表单：新的预约沟通';

export type ContactErrorCode =
  | 'method_not_allowed'
  | 'bad_request'
  | 'payload_too_large'
  | 'validation_failed'
  | 'rate_limited'
  | 'send_failed'
  | 'server_error';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function fail(
  status: number,
  error: ContactErrorCode,
  extra: {
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {},
): Response {
  return jsonResponse(
    status,
    { ok: false, error, ...extra.body },
    extra.headers,
  );
}

// 日志只允许结果码和我们自己定的短代码，任何别的字符串都不进日志，
// 免得第三方错误信息里夹带收件人或表单内容。
const SAFE_DETAIL = /^[A-Za-z0-9_.,:-]{1,120}$/;

function log(
  level: 'log' | 'warn' | 'error',
  outcome: string,
  detail?: string,
): void {
  const entry: Record<string, string> = { route: CONTACT_PATH, outcome };
  if (detail !== undefined) {
    entry.detail = SAFE_DETAIL.test(detail) ? detail : 'redacted';
  }
  console[level](JSON.stringify(entry));
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    if (error instanceof Error) return error.name;
  }
  return 'unknown';
}

/** 接口要的全部配置（Cloudflare secret；本地放 .dev.vars）。缺一个就返回 500 */
export const REQUIRED_CONFIG = ['CONTACT_TO', 'CONTACT_FROM'] as const;

type BodyResult =
  | { ok: true; data: Record<string, unknown> }
  | {
      ok: false;
      status: 400 | 413;
      error: 'bad_request' | 'payload_too_large';
    };

async function readBody(request: Request): Promise<BodyResult> {
  const tooLarge = {
    ok: false,
    status: 413,
    error: 'payload_too_large',
  } as const;
  const badRequest = { ok: false, status: 400, error: 'bad_request' } as const;

  const declared = Number(request.headers.get('content-length'));
  if (declared > MAX_BODY_BYTES) return tooLarge;

  // 只在判断类型时转小写；解析时用原值，multipart 的 boundary 区分大小写
  const contentType = request.headers.get('content-type') ?? '';
  const type = contentType.toLowerCase();
  const isJson = type.startsWith('application/json');
  const isForm =
    type.startsWith('application/x-www-form-urlencoded') ||
    type.startsWith('multipart/form-data');
  if (!isJson && !isForm) return badRequest;

  let bytes: Uint8Array<ArrayBuffer> | null;
  try {
    bytes = await readLimited(request.body, MAX_BODY_BYTES);
  } catch {
    return badRequest;
  }
  if (bytes === null) return tooLarge;

  // 用没有原型的对象接表单，键名是 __proto__ 之类的也只是普通键
  const data: Record<string, unknown> = Object.create(null);
  try {
    if (isJson) {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return badRequest;
      }
      Object.assign(data, parsed);
    } else {
      const form = await new Response(bytes, {
        headers: { 'content-type': contentType },
      }).formData();
      // 同名的键出现多次（多选）时收成数组，只出现一次时还是单个值
      for (const key of new Set(form.keys())) {
        const all = form.getAll(key);
        data[key] = all.length > 1 ? all : all[0];
      }
    }
  } catch {
    return badRequest;
  }
  return { ok: true, data };
}

function buildEmail(
  values: Record<string, FieldValue>,
  fields: readonly FieldSpec[],
  to: string,
  from: string,
): EmailMessageBuilder {
  // 多选的值用顿号连成一行
  const line = (value: FieldValue) =>
    Array.isArray(value) ? value.join('、') : value;
  const text = fields
    .flatMap((field) => {
      const value = values[field.name];
      return value === undefined ? [] : [`${field.name}:\n${line(value)}`];
    })
    .join('\n\n');
  const replyField = fields.find(
    (field) => 'replyTo' in field && field.replyTo,
  );
  const replyTo = replyField ? values[replyField.name] : undefined;

  return {
    to,
    from,
    subject: EMAIL_SUBJECT,
    text,
    ...(typeof replyTo === 'string' ? { replyTo } : {}),
  };
}

async function allowedByRateLimit(
  env: Env,
  ip: string | null,
): Promise<boolean> {
  try {
    const { success } = await env.CONTACT_RATE_LIMITER.limit({
      key: `contact:${ip ?? 'unknown'}`,
    });
    return success;
  } catch (error) {
    // 限流绑定出错时放行：宁可这段时间没有限流，也不把真实用户全拒掉
    log('error', 'rate_limit_error', errorCode(error));
    return true;
  }
}

export async function handleContact(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== 'POST') {
    return fail(405, 'method_not_allowed', { headers: { allow: 'POST' } });
  }

  const { CONTACT_TO: to, CONTACT_FROM: from } = env;
  if (!to || !from) {
    const missing = REQUIRED_CONFIG.filter((name) => !env[name]);
    log('error', 'server_error', `missing_config:${missing.join(',')}`);
    return fail(500, 'server_error');
  }

  const ip = request.headers.get('cf-connecting-ip');
  if (!(await allowedByRateLimit(env, ip))) {
    log('warn', 'rate_limited');
    return fail(429, 'rate_limited', {
      headers: { 'retry-after': String(RETRY_AFTER_SECONDS) },
    });
  }

  const body = await readBody(request);
  if (!body.ok) {
    log('warn', body.error);
    return fail(body.status, body.error);
  }

  const validation = validateFields(body.data, CONTACT_FIELDS);
  if (!validation.ok) {
    const summary = Object.entries(validation.errors).map(
      ([name, code]) => `${name}:${code}`,
    );
    log('warn', 'validation_failed', summary.join(','));
    return fail(422, 'validation_failed', {
      body: { fields: validation.errors },
    });
  }

  try {
    await env.EMAIL.send(
      buildEmail(validation.values, CONTACT_FIELDS, to, from),
    );
  } catch (error) {
    log('error', 'send_failed', errorCode(error));
    return fail(502, 'send_failed');
  }

  log('log', 'sent');
  return jsonResponse(200, { ok: true });
}
