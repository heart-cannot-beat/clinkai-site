import { describe, expect, it } from 'vitest';
import { createFakeEnv } from './fake-env';
import worker from './index';

describe('Worker 路由', () => {
  it('/api/contact 交给表单接口', async () => {
    const { env, assetsFetch } = createFakeEnv();

    const response = await worker.fetch(
      new Request('https://clinkai.example/api/contact'),
      env,
    );

    expect(response.status).toBe(405);
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it('其他 /api/ 路径返回 JSON 404', async () => {
    const { env, assetsFetch } = createFakeEnv();

    const response = await worker.fetch(
      new Request('https://clinkai.example/api/nope'),
      env,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: 'not_found' });
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it('非 /api/ 路径交给静态资源', async () => {
    const { env, assetsFetch } = createFakeEnv();
    const request = new Request('https://clinkai.example/missing-page');

    const response = await worker.fetch(request, env);

    expect(assetsFetch).toHaveBeenCalledWith(request);
    expect(await response.text()).toBe('静态资源');
  });
});
