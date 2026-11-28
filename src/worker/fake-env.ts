// 只给测试用的假绑定：假的发信、假的限流、假的静态资源。测试里不会真的发信。
import { vi } from 'vitest';
import type { EmailMessageBuilder, Env } from './env';

// 虚构的 *.example 地址，不是真实邮箱
export const TEST_CONFIG = {
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
