import { describe, expect, it } from 'vitest';
import {
  pageProblems,
  readPage,
  REQUIRED_SHARE_TAGS,
  robotsTxt,
  routePath,
  sitemapPages,
  sitemapXml,
} from './pages';
import { SITE_URL } from './site';

const IMAGE = `${SITE_URL}/share/clinkai.png`;

interface Fixture {
  title?: string | null;
  description?: string | null;
  noindex?: boolean;
  canonical?: string | null;
  /** 去掉哪些分享卡片标签 */
  without?: readonly string[];
  /** 替换某个标签的 content */
  override?: Record<string, string>;
  extraHead?: string;
}

/** 一个页面的 HTML，默认是 BaseLayout 给会被收录的页面写出来的样子 */
function html(path: string, fixture: Fixture = {}): string {
  const {
    title = '示例标题',
    description = '示例描述',
    noindex = false,
    canonical = noindex ? null : `${SITE_URL}${path}`,
    without = [],
    override = {},
    extraHead = '',
  } = fixture;
  const share: Record<string, string> = {
    'og:type': 'website',
    'og:site_name': 'ClinkAI',
    'og:title': title ?? '',
    'og:description': description ?? '',
    'og:image': IMAGE,
    'twitter:card': 'summary_large_image',
    'twitter:title': title ?? '',
    'twitter:description': description ?? '',
    'twitter:image': IMAGE,
    ...(canonical ? { 'og:url': canonical } : {}),
    ...override,
  };
  const tags = Object.entries(share)
    .filter(([key]) => !without.includes(key))
    .map(([key, content]) =>
      key.startsWith('og:')
        ? `<meta property="${key}" content="${content}">`
        : `<meta name="${key}" content="${content}">`,
    );
  return [
    '<!DOCTYPE html><html lang="zh-CN"><head>',
    '<meta charset="utf-8">',
    title === null ? '' : `<title>${title}</title>`,
    description === null
      ? ''
      : `<meta name="description" content="${description}">`,
    noindex ? '<meta name="robots" content="noindex, nofollow">' : '',
    canonical ? `<link rel="canonical" href="${canonical}">` : '',
    ...tags,
    extraHead,
    '</head><body><main><meta name="description" content="正文里的不算"></main></body></html>',
  ].join('\n');
}

const page = (file: string, fixture?: Fixture) =>
  readPage(file, html(routePath(file), fixture));

describe('dist/ 里的文件名 → 站点上的路径', () => {
  it.each([
    ['index.html', '/'],
    ['contact/index.html', '/contact/'],
    ['a/b/index.html', '/a/b/'],
    ['contact\\index.html', '/contact/'],
  ])('%s → %s', (file, expected) => {
    expect(routePath(file)).toBe(expected);
  });
});

describe('读出页面 <head> 里的东西', () => {
  it('标题、描述、分享卡片、canonical 都读得到', () => {
    const built = page('contact/index.html');

    expect(built.file).toBe('contact/index.html');
    expect(built.path).toBe('/contact/');
    expect(built.title).toBe('示例标题');
    expect(built.meta.description).toBe('示例描述');
    expect(built.meta['og:image']).toBe(IMAGE);
    expect(built.meta['twitter:card']).toBe('summary_large_image');
    expect(built.canonical).toBe(`${SITE_URL}/contact/`);
    expect(built.noindex).toBe(false);
  });

  it('只看 <head>，正文里的标签不算', () => {
    expect(
      page('index.html', { description: null }).meta.description,
    ).toBeUndefined();
  });

  it('转义过的字符读回原样', () => {
    const built = page('index.html', {
      title: 'A &amp; B',
      description: '他说&quot;好&quot;，&#39;行&#39;',
    });

    expect(built.title).toBe('A & B');
    expect(built.meta.description).toBe('他说"好"，\'行\'');
  });

  it('robots 里带 noindex 的算不收录', () => {
    expect(page('parts/index.html', { noindex: true }).noindex).toBe(true);
  });

  it('没有标题时是 null', () => {
    expect(page('index.html', { title: null }).title).toBeNull();
  });
});

describe('检查一个页面', () => {
  it('BaseLayout 写出来的页面没有问题：会被收录的和不收录的都是', () => {
    expect(pageProblems(page('index.html'))).toEqual([]);
    expect(pageProblems(page('contact/index.html'))).toEqual([]);
    expect(pageProblems(page('parts/index.html', { noindex: true }))).toEqual(
      [],
    );
    expect(pageProblems(page('404.html', { noindex: true }))).toEqual([]);
  });

  it('没有标题、没有描述', () => {
    const problems = pageProblems(
      page('index.html', { title: null, description: null }),
    );

    expect(problems).toContain('没有 <title>');
    expect(problems).toContain('没有描述（meta description）');
  });

  it.each(REQUIRED_SHARE_TAGS)('分享卡片缺 %s', (tag) => {
    expect(pageProblems(page('index.html', { without: [tag] }))).toEqual([
      `分享卡片缺 ${tag}`,
    ]);
  });

  it('分享图要是正式域名下的完整地址', () => {
    const problems = pageProblems(
      page('index.html', { override: { 'og:image': '/share/clinkai.png' } }),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('og:image');
  });

  it('<head> 里不能出现 workers.dev 地址', () => {
    const problems = pageProblems(
      page('index.html', {
        extraHead:
          '<link rel="alternate" href="https://clinkai-site.someone.workers.dev/">',
      }),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('workers.dev');
  });

  it('会被收录的页面：canonical 和 og:url 要指向它自己', () => {
    const wrong = pageProblems(
      page('contact/index.html', { canonical: `${SITE_URL}/` }),
    );
    const missing = pageProblems(
      page('contact/index.html', { canonical: null }),
    );

    expect(wrong).toHaveLength(2);
    expect(wrong[0]).toContain(`canonical 应该是 ${SITE_URL}/contact/`);
    expect(wrong[1]).toContain(`og:url 应该是 ${SITE_URL}/contact/`);
    expect(missing).toHaveLength(2);
    expect(missing[0]).toContain('（没写）');
  });

  it('不收录的页面不写 canonical', () => {
    expect(
      pageProblems(
        page('parts/index.html', {
          noindex: true,
          canonical: `${SITE_URL}/parts/`,
        }),
      ),
    ).toEqual(['不收录的页面不要写 canonical']);
  });
});

describe('站点地图和 robots.txt', () => {
  const pages = [
    page('privacy/index.html'),
    page('parts/index.html', { noindex: true }),
    page('index.html'),
    page('404.html', { noindex: true }),
    page('media/index.html', { noindex: true }),
    page('contact/index.html'),
  ];

  it('站点地图里只有会被收录的页面，按路径排序', () => {
    expect(sitemapPages(pages).map((item) => item.path)).toEqual([
      '/',
      '/contact/',
      '/privacy/',
    ]);
  });

  it('站点地图是完整地址的 XML，没有部件陈列页和 404 页', () => {
    const xml = sitemapXml(pages);

    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        `  <url><loc>${SITE_URL}/</loc></url>`,
        `  <url><loc>${SITE_URL}/contact/</loc></url>`,
        `  <url><loc>${SITE_URL}/privacy/</loc></url>`,
        '</urlset>',
        '',
      ].join('\n'),
    );
    expect(xml).not.toContain('/parts/');
    expect(xml).not.toContain('404');
  });

  it('404 页就算没标 noindex 也不进站点地图', () => {
    expect(sitemapPages([page('404.html'), page('index.html')])).toHaveLength(
      1,
    );
  });

  it('地址里的特殊字符在 XML 里转义', () => {
    expect(sitemapXml([page('a&b/index.html')])).toContain(
      `<loc>${SITE_URL}/a&amp;b/</loc>`,
    );
  });

  it('robots.txt：接口和不收录的页面不让抓，指出站点地图', () => {
    expect(robotsTxt(pages)).toBe(
      [
        'User-agent: *',
        'Disallow: /api/',
        'Disallow: /media/',
        'Disallow: /parts/',
        '',
        `Sitemap: ${SITE_URL}/sitemap.xml`,
        '',
      ].join('\n'),
    );
  });

  it('robots.txt 里不列 404 页，也不拦会被收录的页面', () => {
    const robots = robotsTxt(pages);

    expect(robots).not.toContain('404');
    expect(robots).not.toMatch(/^Disallow: \/$/m);
    expect(robots).not.toContain('/contact/');
    expect(robots).not.toContain('/privacy/');
  });
});
