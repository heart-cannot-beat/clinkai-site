// 只给测试用的假绑定：假的发信、假的限流、假的静态资源。测试里不会真的发信。
import { vi } from 'vitest';
import type { EmailMessageBuilder, Env } from './env';

export const TEST_CONFIG = {
  // Turnstile 官方测试密钥（永远通过），不是真密钥。测试里 siteverify 也是假的。
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
  // siteverify 返回的主机名必须在这里面。虚构域名，不写真实的 workers.dev 地址。
  TURNSTILE_HOSTNAMES: 'clinkai.example,preview.clinkai.example',
  CONTACT_TO: 'inbox@clinkai.example',
  CONTACT_FROM: 'noreply@clinkai.example',
} as const;

export function createFakeEnv(overrides: Partial<Env> = {}) {
  const send = vi.fn<
    (message: EmailMessageBuilder) => Promise<{ messageId: string }>
  >(async () => ({ messageId: 'fake-message-id' }));
  const limit = vi.fn<
    (options: { key: string }) => Promise<{ success: boolean }>
  >(async () => ({
    success: true,
  }));
  const assetsFetch = vi.fn<(request: Request) => Promise<Response>>(
    async () => new Response('静态资源'),
  );

  const env: Env = {
    ASSETS: { fetch: assetsFetch },
    EMAIL: { send },
    CONTACT_RATE_LIMITER: { limit },
    ...TEST_CONFIG,
    ...overrides,
  };

  return { env, send, limit, assetsFetch };
}
