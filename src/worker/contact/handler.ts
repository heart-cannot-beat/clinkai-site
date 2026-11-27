// POST /api/contact：预约沟通表单接口。
// 顺序：方法 → 配置 → 限流 → 读请求体 → 字段校验 → Turnstile → 发信。
// 不存库；日志只记结果码，不记表单内容、联系方式、token 和 IP。
// 状态码和响应体的约定见 docs/contact-api.md。

import type { EmailMessageBuilder, Env } from '../env';
import {
  CONTACT_FIELDS,
  TURNSTILE_FIELD,
  validateFields,
  type FieldSpec,
} from './schema';
import { MAX_TOKEN_LENGTH, verifyTurnstile } from './turnstile';

export const CONTACT_PATH = '/api/contact';

/** 请求体上限。占位字段全部填满也不到这个数的一半。 */
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
  | 'turnstile_failed'
  | 'rate_limited'
  | 'turnstile_unavailable'
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

const REQUIRED_CONFIG = [
  'TURNSTILE_SECRET_KEY',
  'CONTACT_TO',
  'CONTACT_FROM',
] as const;

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

  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  const isJson = contentType.startsWith('application/json');
  const isForm =
    contentType.startsWith('application/x-www-form-urlencoded') ||
    contentType.startsWith('multipart/form-data');
  if (!isJson && !isForm) return badRequest;

  let bytes: ArrayBuffer;
  try {
    bytes = await request.arrayBuffer();
  } catch {
    return badRequest;
  }
  if (bytes.byteLength > MAX_BODY_BYTES) return tooLarge;

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
      for (const [key, value] of form) {
        if (!Object.hasOwn(data, key)) data[key] = value;
      }
    }
  } catch {
    return badRequest;
  }
  return { ok: true, data };
}

function buildEmail(
  values: Record<string, string>,
  fields: readonly FieldSpec[],
  to: string,
  from: string,
): EmailMessageBuilder {
  const text = fields
    .filter((field) => values[field.name] !== undefined)
    .map((field) => `${field.name}:\n${values[field.name]}`)
    .join('\n\n');
  const replyField = fields.find((field) => field.replyTo);
  const replyTo = replyField ? values[replyField.name] : undefined;

  return {
    to,
    from,
    subject: EMAIL_SUBJECT,
    text,
    ...(replyTo ? { replyTo } : {}),
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
    // 限流绑定出错时放行：后面还有 Turnstile 兜底，比把真实用户全拒掉好
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

  const {
    TURNSTILE_SECRET_KEY: secret,
    CONTACT_TO: to,
    CONTACT_FROM: from,
  } = env;
  if (!secret || !to || !from) {
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

  const token = body.data[TURNSTILE_FIELD];
  if (
    typeof token !== 'string' ||
    token === '' ||
    token.length > MAX_TOKEN_LENGTH
  ) {
    log('warn', 'turnstile_failed', 'missing-or-oversized-token');
    return fail(403, 'turnstile_failed');
  }

  const verdict = await verifyTurnstile(token, secret, ip);
  if (verdict.result !== 'passed') {
    const detail = verdict.codes.join(',');
    switch (verdict.result) {
      case 'rejected':
        log('warn', 'turnstile_failed', detail);
        return fail(403, 'turnstile_failed');
      case 'unavailable':
        log('error', 'turnstile_unavailable', detail);
        return fail(503, 'turnstile_unavailable');
      case 'misconfigured':
        log('error', 'server_error', `turnstile:${detail}`);
        return fail(500, 'server_error');
    }
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
