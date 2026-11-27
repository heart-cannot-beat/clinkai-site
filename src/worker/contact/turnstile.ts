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
 * - rejected：token 缺失、无效、过期、已用过，或者不是在白名单里的主机名上签发的；
 *   前端应重置组件让用户再试
 * - unavailable：siteverify 连不上或自己出错，稍后再试
 * - misconfigured：我们的密钥没配或配错
 */
export type TurnstileVerdict =
  | { result: 'passed' }
  | { result: 'rejected' | 'unavailable' | 'misconfigured'; codes: string[] };

const SECRET_ERRORS = new Set(['missing-input-secret', 'invalid-input-secret']);

/**
 * 解析 TURNSTILE_HOSTNAMES：逗号分隔，去掉空白，转小写，丢掉空项。
 * 结果为空时接口当作缺配置处理（返回 500），不会跳过主机名校验。
 */
export function parseHostnames(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((hostname) => hostname.trim().toLowerCase())
    .filter((hostname) => hostname !== '');
}

function errorCodes(data: unknown): string[] {
  if (typeof data !== 'object' || data === null) return [];
  const codes = (data as Record<string, unknown>)['error-codes'];
  return Array.isArray(codes)
    ? codes.filter((code) => typeof code === 'string')
    : [];
}

export interface TurnstileCheck {
  token: string;
  secret: string;
  remoteIp: string | null;
  /** parseHostnames 的结果，不能为空。只做完全匹配，不含子域名。 */
  allowedHostnames: readonly string[];
}

export async function verifyTurnstile({
  token,
  secret,
  remoteIp,
  allowedHostnames,
}: TurnstileCheck): Promise<TurnstileVerdict> {
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
    // 官方建议核对签发 token 的主机名，挡住别的站点拿同一个 sitekey 签出来的 token
    const hostname = (data as { hostname?: unknown }).hostname;
    const allowed =
      typeof hostname === 'string' &&
      allowedHostnames.includes(hostname.toLowerCase());
    return allowed
      ? { result: 'passed' }
      : { result: 'rejected', codes: ['hostname-mismatch'] };
  }

  const codes = errorCodes(data);
  if (codes.some((code) => SECRET_ERRORS.has(code))) {
    return { result: 'misconfigured', codes };
  }
  if (codes.includes('internal-error')) return { result: 'unavailable', codes };
  return { result: 'rejected', codes };
}
