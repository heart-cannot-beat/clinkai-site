import { describe, expect, it, vi } from 'vitest';
import { cleanPath, cleanReferrer, VISIT_PATH } from '../worker/visit/schema';
import {
  buildVisitReport,
  referrerHost,
  reportVisit,
  VISIT_PATH_ATTRIBUTE,
  type VisitWindow,
} from './report';
import reportSource from './report.ts?raw';

interface Fake {
  path?: string | null;
  referrer?: string;
  hostname?: string;
  webdriver?: boolean;
  fetch?: typeof fetch;
}

function fakeWindow(fake: Fake = {}) {
  const fetchMock =
    fake.fetch ??
    vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
  const path = 'path' in fake ? fake.path : '/contact/';
  const win: VisitWindow = {
    document: {
      referrer: fake.referrer ?? '',
      body: {
        getAttribute: (name) =>
          name === VISIT_PATH_ATTRIBUTE ? (path ?? null) : null,
      },
    },
    location: { hostname: fake.hostname ?? 'clinkai.example' },
    navigator: { webdriver: fake.webdriver ?? false },
    fetch: fetchMock,
  };
  return {
    win,
    fetchMock: fetchMock as ReturnType<typeof vi.fn<typeof fetch>>,
  };
}

describe('来源只留域名', () => {
  it('完整的来源地址只留下域名：路径和搜索词不离开浏览器', () => {
    expect(
      referrerHost(
        'https://www.search.example/results?q=private+words#top',
        'clinkai.example',
      ),
    ).toBe('www.search.example');
  });

  it('端口不要', () => {
    expect(referrerHost('http://a.example:8080/x', 'clinkai.example')).toBe(
      'a.example',
    );
  });

  it('站内跳转、没有来源、看不懂的来源：空的', () => {
    expect(
      referrerHost('https://clinkai.example/contact/', 'clinkai.example'),
    ).toBe('');
    expect(referrerHost('', 'clinkai.example')).toBe('');
    expect(referrerHost('not a url', 'clinkai.example')).toBe('');
  });

  it('留下来的域名，接口那边的清洗也收', () => {
    const host = referrerHost(
      'https://www.search.example/results?q=x',
      'clinkai.example',
    );

    expect(cleanReferrer(host, 'clinkai.example')).toBe(host);
  });
});

describe('要发的内容', () => {
  it('只有两项：页面上写的路径，和来源的域名', () => {
    const { win } = fakeWindow({
      referrer: 'https://www.search.example/results?q=x',
    });

    expect(buildVisitReport(win)).toEqual({
      path: '/contact/',
      referrer: 'www.search.example',
    });
  });

  it('路径取页面上构建时写好的那个，接口那边的清洗收', () => {
    const report = buildVisitReport(fakeWindow({ path: '/privacy/' }).win);

    expect(report?.path).toBe('/privacy/');
    expect(cleanPath(report?.path)).toBe('/privacy/');
  });

  it('页面上没有路径：不发', () => {
    expect(buildVisitReport(fakeWindow({ path: null }).win)).toBeNull();
    expect(buildVisitReport(fakeWindow({ path: '' }).win)).toBeNull();
  });

  it('页面还没有 <body>：不发，也不报错', () => {
    const { win } = fakeWindow();
    win.document.body = null;

    expect(buildVisitReport(win)).toBeNull();
  });
});

describe('页面打开时发一条', () => {
  it('往自己的记数接口发一个 POST，JSON，不带 cookie', () => {
    const { win, fetchMock } = fakeWindow({
      referrer: 'https://www.search.example/results?q=x',
    });

    reportVisit(win);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(VISIT_PATH);
    expect(url).toBe('/api/visit');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'omit',
      keepalive: true,
    });
    expect(JSON.parse(init!.body as string)).toEqual({
      path: '/contact/',
      referrer: 'www.search.example',
    });
  });

  it('发出去的东西里没有完整的来源地址', () => {
    const { win, fetchMock } = fakeWindow({
      referrer: 'https://www.search.example/results?q=private+words',
    });

    reportVisit(win);

    const body = fetchMock.mock.calls[0]![1]!.body as string;
    expect(body).not.toContain('private');
    expect(body).not.toContain('results');
    expect(body).not.toContain('https://');
  });

  it('自动化测试和截图用的浏览器：不发', () => {
    const { win, fetchMock } = fakeWindow({ webdriver: true });

    reportVisit(win);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('页面上没有路径：不发', () => {
    const { win, fetchMock } = fakeWindow({ path: null });

    reportVisit(win);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('接口不通（没有网、本地没有接口）：不报错，页面照常', async () => {
    const rejected = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const { win } = fakeWindow({ fetch: rejected });

    expect(() => reportVisit(win)).not.toThrow();
    // 等那个失败的请求走完：没有被吞掉的话，Vitest 会报「未处理的拒绝」
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it('fetch 本身抛错：也不报错', () => {
    const broken = vi.fn<typeof fetch>(() => {
      throw new Error('fetch 不可用');
    });
    const { win } = fakeWindow({ fetch: broken });

    expect(() => reportVisit(win)).not.toThrow();
  });
});

describe('页面脚本不碰的东西', () => {
  it('不读不写 cookie，不往浏览器里存东西，不读浏览器和屏幕的信息', () => {
    expect(reportSource).not.toMatch(
      /\.cookie|cookieStore|localStorage|sessionStorage|indexedDB/,
    );
    expect(reportSource).not.toMatch(
      /userAgent|\.platform|\.languages?\b|screen\.|devicePixelRatio|hardwareConcurrency|deviceMemory/,
    );
  });

  it('只往自己的接口发，没有任何外部地址', () => {
    expect(reportSource).not.toMatch(/https?:\/\//);
  });
});
