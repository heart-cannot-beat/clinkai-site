// Turnstile 服务端校验。
// 文档：https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

export const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** 官方文档写的 token 长度上限 */
export const MAX_TOKEN_LENGTH = 2048;

/** siteverify 超过这个时间没回就当作不可用 */
const TIMEOUT_MS = 5000;

/**
 * - passed：通过
 * - rejected：token 缺失、无效、过期或已用过，前端应重置组件让用户再试
 * - unavailable：siteverify 连不上或自己出错，稍后再试
 * - misconfigured：我们的密钥没配或配错
 */
export type TurnstileVerdict =
  | { result: 'passed' }
  | { result: 'rejected' | 'unavailable' | 'misconfigured'; codes: string[] };

const SECRET_ERRORS = new Set(['missing-input-secret', 'invalid-input-secret']);

function errorCodes(data: unknown): string[] {
  if (typeof data !== 'object' || data === null) return [];
  const codes = (data as Record<string, unknown>)['error-codes'];
  return Array.isArray(codes)
    ? codes.filter((code) => typeof code === 'string')
    : [];
}

export async function verifyTurnstile(
  token: string,
  secret: string,
  remoteIp: string | null,
): Promise<TurnstileVerdict> {
  let response: Response;
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { result: 'unavailable', codes: ['fetch-failed'] };
  }

  if (!response.ok) {
    return { result: 'unavailable', codes: [`http-${response.status}`] };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { result: 'unavailable', codes: ['bad-json'] };
  }

  if (
    typeof data === 'object' &&
    data !== null &&
    (data as { success?: unknown }).success === true
  ) {
    return { result: 'passed' };
  }

  const codes = errorCodes(data);
  if (codes.some((code) => SECRET_ERRORS.has(code))) {
    return { result: 'misconfigured', codes };
  }
  if (codes.includes('internal-error')) return { result: 'unavailable', codes };
  return { result: 'rejected', codes };
}
