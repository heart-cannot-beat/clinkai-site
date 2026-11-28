import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeEnv } from '../fake-env';
import worker from '../index';
import { handleVisit } from './handler';
import handlerSource from './handler.ts?raw';
import { MAX_VISIT_BODY_BYTES, VISIT_FIELDS, VISIT_PATH } from './schema';

const ORIGIN = 'https://clinkai.example';
const URL_ = `${ORIGIN}${VISIT_PATH}`;
// 文档专用的示例 IP（203.0.113.0/24），不是真实地址
const IP = '203.0.113.7';
const UA_PHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.54 NetType/WIFI Language/zh_CN';
const UA_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';

interface Options {
  body?: unknown;
  rawBody?: BodyInit;
  headers?: Record<string, string | null>;
  country?: unknown;
  method?: string;
}

/** 浏览器里页面脚本会发出来的那种请求，外加 Cloudflare 附带的国家和 IP */
function visitRequest(options: Options = {}): Request {
  const {
    body = { path: '/contact/', referrer: 'www.search.example' },
    rawBody,
    headers = {},
    method = 'POST',
  } = options;
  // 明确传了 undefined 就是「Cloudflare 没给」，不能被默认值盖掉
  const country = 'country' in options ? options.country : 'CN';
  const merged: Record<string, string | null> = {
    'content-type': 'application/json',
    origin: ORIGIN,
    'user-agent': UA_PHONE,
    'cf-connecting-ip': IP,
    cookie: 'session=should-never-be-read',
    ...headers,
  };
  const request = new Request(URL_, {
    method,
    headers: Object.entries(merged).filter(
      (entry): entry is [string, string] => entry[1] !== null,
    ),
    body: method === 'POST' ? (rawBody ?? JSON.stringify(body)) : undefined,
  });
  return Object.assign(request, { cf: { country } });
}

let consoleError: ReturnType<typeof vi.spyOn>;
let consoleLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // 接口不该访问任何外部服务
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('接口不应该发起任何外部请求');
    }),
  );
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function expectNoContent(response: Response) {
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
}

describe('POST /api/visit：记一条', () => {
  it('记下四项：页面路径、来源域名、国家或地区、设备；回 204', async () => {
    const { env, writeDataPoint } = createFakeEnv();

    const response = await handleVisit(visitRequest(), env);

    await expectNoContent(response);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ['/contact/'],
      blobs: ['/contact/', 'www.search.example', 'CN', 'mobile'],
    });
  });

  it('记的内容只有这四项，顺序和约定的一致，没有数字列', async () => {
    const { env, writeDataPoint } = createFakeEnv();

    await handleVisit(visitRequest(), env);

    const point = writeDataPoint.mock.calls[0]![0];
    expect(Object.keys(point).sort()).toEqual(['blobs', 'indexes']);
    expect(point.blobs).toHaveLength(VISIT_FIELDS.length);
    expect(VISIT_FIELDS).toHaveLength(4);
    expect(point.indexes).toEqual([point.blobs![0]]);
  });

  it('没有 IP、没有 cookie、没有 User-Agent 原文', async () => {
    const { env, writeDataPoint } = createFakeEnv();

    await handleVisit(visitRequest(), env);

    const written = JSON.stringify(writeDataPoint.mock.calls);
    expect(written).not.toContain(IP);
    expect(written).not.toContain('203.0.113');
    expect(written).not.toContain('should-never-be-read');
    expect(written).not.toContain('Mozilla');
    expect(written).not.toContain('MicroMessenger');
  });

  it('代码里根本不读 IP 和 cookie', () => {
    expect(handlerSource).not.toMatch(
      /cf-connecting-ip|x-forwarded-for|x-real-ip|true-client-ip/i,
    );
    expect(handlerSource).not.toMatch(/headers\.get\(\s*['"]cookie['"]/i);
    expect(handlerSource).not.toMatch(/set-cookie/i);
  });

  it('不写 cookie，响应不让缓存', async () => {
    const { env } = createFakeEnv();

    const response = await handleVisit(visitRequest(), env);

    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('不记日志', async () => {
    const { env } = createFakeEnv();

    await handleVisit(visitRequest(), env);

    expect(consoleLog).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('电脑上打开记成 desktop', async () => {
    const { env, writeDataPoint } = createFakeEnv();

    await handleVisit(
      visitRequest({ headers: { 'user-agent': UA_DESKTOP } }),
      env,
    );

    expect(writeDataPoint.mock.calls[0]![0].blobs![3]).toBe('desktop');
  });

  it('没有来源、来源是站内跳转、来源不是域名：来源记成空的，这一条照记', async () => {
    for (const referrer of [
      '',
      undefined,
      'clinkai.example',
      'https://www.search.example/results?q=secret',
    ]) {
      const { env, writeDataPoint } = createFakeEnv();

      await handleVisit(visitRequest({ body: { path: '/', referrer } }), env);

      expect(writeDataPoint, String(referrer)).toHaveBeenCalledWith({
        indexes: ['/'],
        blobs: ['/', '', 'CN', 'mobile'],
      });
    }
  });

  it('Cloudflare 没给国家或地区（本地开发）：记成空的', async () => {
    for (const country of [undefined, null, 'unknown']) {
      const { env, writeDataPoint } = createFakeEnv();

      await handleVisit(visitRequest({ country }), env);

      expect(writeDataPoint.mock.calls[0]![0].blobs![2]).toBe('');
    }
  });

  it('请求体里多出来的键直接丢掉', async () => {
    const { env, writeDataPoint } = createFakeEnv();

    await handleVisit(
      visitRequest({
        body: {
          path: '/',
          referrer: 'a.example',
          visitor: 'abc123',
          ip: IP,
          screen: '390x844',
        },
      }),
      env,
    );

    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ['/'],
      blobs: ['/', 'a.example', 'CN', 'mobile'],
    });
  });
});

describe('POST /api/visit：不记的情况（都回 204，页面不受影响）', () => {
  it('没有统计绑定（PR 预览、没配好的环境）：不记，也不报错', async () => {
    const { env } = createFakeEnv({ VISITS: undefined });

    await expectNoContent(await handleVisit(visitRequest(), env));
    expect(consoleError).not.toHaveBeenCalled();
  });

  it.each([
    ['别的网站发来的', { origin: 'https://evil.example' }],
    ['没有 Origin（不是浏览器里的页面发的）', { origin: null }],
    [
      '爬虫',
      {
        'user-agent':
          'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
    ],
    ['没有 User-Agent', { 'user-agent': null }],
    ['不是 JSON', { 'content-type': 'text/plain' }],
  ])('%s', async (_, headers) => {
    const { env, writeDataPoint } = createFakeEnv();

    await expectNoContent(await handleVisit(visitRequest({ headers }), env));
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it.each([
    ['路径不是站点页面的写法', { path: '/contact/?from=x', referrer: '' }],
    ['没有路径', { referrer: 'a.example' }],
    ['不是对象', ['/contact/']],
    ['是 null', null],
  ])('%s', async (_, body) => {
    const { env, writeDataPoint } = createFakeEnv();

    await expectNoContent(await handleVisit(visitRequest({ body }), env));
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('请求体不是合法的 JSON', async () => {
    const { env, writeDataPoint } = createFakeEnv();

    await expectNoContent(
      await handleVisit(visitRequest({ rawBody: '{"path": ' }), env),
    );
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('请求体太大：按 Content-Length 直接不读', async () => {
    const { env, writeDataPoint } = createFakeEnv();
    const body = { path: '/', referrer: 'a'.repeat(MAX_VISIT_BODY_BYTES) };

    await expectNoContent(await handleVisit(visitRequest({ body }), env));
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('请求体太大又没有 Content-Length（分块上传）：读到上限就停', async () => {
    const { env, writeDataPoint } = createFakeEnv();
    const chunk = new TextEncoder().encode('x'.repeat(600));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const request = new Request(URL_, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: ORIGIN,
        'user-agent': UA_PHONE,
      },
      body: stream,
      // Node 里用流当请求体要写这一项
      duplex: 'half',
    } as RequestInit);

    await expectNoContent(await handleVisit(request, env));
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('写入出错：照样回 204，日志只记错误的名字', async () => {
    const { env, writeDataPoint } = createFakeEnv();
    writeDataPoint.mockImplementation(() => {
      throw new TypeError(`写不进去：${IP} /contact/`);
    });

    await expectNoContent(await handleVisit(visitRequest(), env));
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      JSON.stringify({
        route: VISIT_PATH,
        outcome: 'write_failed',
        detail: 'TypeError',
      }),
    );
  });
});

describe('POST /api/visit：方法和路由', () => {
  it('不是 POST：405', async () => {
    const { env, writeDataPoint } = createFakeEnv();

    const response = await handleVisit(visitRequest({ method: 'GET' }), env);

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('Worker 把 /api/visit 交给这个接口，不碰静态资源和发信', async () => {
    const { env, writeDataPoint, assetsFetch, send, limit } = createFakeEnv();

    await expectNoContent(await worker.fetch(visitRequest(), env));
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(assetsFetch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(limit).not.toHaveBeenCalled();
  });
});
