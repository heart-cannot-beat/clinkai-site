import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import copyMd from '../design/copy.md?raw';
import { NOT_FOUND_TITLE } from '../src/data/not-found';
import { PRIVACY_DESCRIPTION, PRIVACY_TITLE } from '../src/data/privacy';
import {
  pageProblems,
  readPage,
  REQUIRED_SHARE_TAGS,
  robotsTxt,
  sitemapXml,
  type BuiltPage,
} from '../src/seo/pages';
import {
  absoluteUrl,
  DEFAULT_DESCRIPTION,
  SHARE_IMAGE,
  SITE_URL,
} from '../src/seo/site';

// 上线基础（P-06）：每个页面都有标题、描述和分享卡片。
// 这里把 src/pages/ 下的每个页面都渲染一遍，用构建时的同一套规则（src/seo/pages.ts）检查；
// 以后新加的页面只要套了 BaseLayout，就自动在检查范围里。

type PageComponent = Parameters<AstroContainer['renderToString']>[0];

const pageModules = import.meta.glob<PageComponent>('../src/pages/**/*.astro', {
  import: 'default',
  eager: true,
});

/** src/pages/ 里的文件 → 构建出来的文件名（Astro 的默认规则：目录形式，404 例外） */
function builtFile(source: string): string {
  const name = source.replace('../src/pages/', '').replace(/\.astro$/, '');
  if (name === '404') return '404.html';
  // 页面写成 foo.astro 或 foo/index.astro，构建出来都是 foo/index.html
  return name === 'index' || name.endsWith('/index')
    ? `${name}.html`
    : `${name}/index.html`;
}

const pages = new Map<string, BuiltPage>();

beforeAll(async () => {
  const container = await AstroContainer.create();
  for (const [source, component] of Object.entries(pageModules)) {
    const file = builtFile(source);
    const path = file === '404.html' ? '/404' : `/${file}`;
    const html = await container.renderToString(component, {
      request: new Request(absoluteUrl(path.replace(/index\.html$/, ''))),
    });
    pages.set(file, readPage(file, html));
  }
}, 60_000);

const get = (file: string) => {
  const page = pages.get(file);
  if (!page) throw new Error(`没有渲染出 ${file}`);
  return page;
};
const all = () => [...pages.values()];

describe('每个页面的标题、描述和分享卡片', () => {
  it('src/pages/ 下的页面都渲染出来了（防止读错路径导致空比空）', () => {
    expect([...pages.keys()]).toEqual(
      expect.arrayContaining([
        'index.html',
        'contact/index.html',
        'privacy/index.html',
        '404.html',
        'parts/index.html',
        'media/index.html',
      ]),
    );
  });

  it('每个页面都过得了构建时的那套检查', () => {
    for (const page of all()) {
      expect(pageProblems(page), page.file).toEqual([]);
    }
  });

  it('每个页面都有标题和描述，分享卡片上的和它们一致', () => {
    for (const page of all()) {
      const { title, meta } = page;

      expect(title, page.file).toBeTruthy();
      expect(meta.description, page.file).toBeTruthy();
      expect(meta['og:title'], page.file).toBe(title);
      expect(meta['twitter:title'], page.file).toBe(title);
      expect(meta['og:description'], page.file).toBe(meta.description);
      expect(meta['twitter:description'], page.file).toBe(meta.description);
      for (const tag of REQUIRED_SHARE_TAGS) {
        expect(meta[tag], `${page.file} 的 ${tag}`).toBeTruthy();
      }
    }
  });

  it('分享图是正式域名下的完整地址，带尺寸；全站共用一张', () => {
    for (const { file, meta } of all()) {
      expect(meta['og:image'], file).toBe(`${SITE_URL}${SHARE_IMAGE.path}`);
      expect(meta['twitter:image'], file).toBe(meta['og:image']);
      expect(meta['og:image:width'], file).toBe(String(SHARE_IMAGE.width));
      expect(meta['og:image:height'], file).toBe(String(SHARE_IMAGE.height));
      expect(meta['twitter:card'], file).toBe('summary_large_image');
    }
  });

  it('会被收录的页面：canonical 和 og:url 是它自己在正式域名下的地址', () => {
    for (const [file, path] of [
      ['index.html', '/'],
      ['contact/index.html', '/contact/'],
      ['privacy/index.html', '/privacy/'],
    ] as const) {
      const page = get(file);

      expect(page.noindex, file).toBe(false);
      expect(page.canonical, file).toBe(`${SITE_URL}${path}`);
      expect(page.meta['og:url'], file).toBe(`${SITE_URL}${path}`);
    }
  });

  it('不收录的页面（部件陈列、素材陈列、404）：标了 noindex，不写 canonical 和 og:url', () => {
    for (const file of ['parts/index.html', 'media/index.html', '404.html']) {
      const page = get(file);

      expect(page.noindex, file).toBe(true);
      expect(page.canonical, file).toBeNull();
      expect(page.meta['og:url'], file).toBeUndefined();
    }
  });

  it('哪个页面的 <head> 里都没有 workers.dev 地址', () => {
    for (const page of all()) {
      expect(page.head, page.file).not.toMatch(/workers\.dev/i);
    }
  });
});

describe('标题和描述的文案', () => {
  /** copy.md 某一节里的条目 */
  function copyItems(heading: string): string[] {
    const start = copyMd.indexOf(heading);
    if (start < 0) throw new Error(`copy.md 里没有「${heading}」`);
    const section = copyMd.slice(start, copyMd.indexOf('\n## ', start + 1));
    return [...section.matchAll(/^- (.+)$/gm)].map((match) => match[1]!);
  }

  it('首页：标题是 ClinkAI，描述照抄 copy.md 首屏的中文说明（两行连成一句）', () => {
    const lines = copyItems('## 01 首屏').filter((item) =>
      item.includes(' / '),
    );

    expect(lines).toHaveLength(1);
    expect(DEFAULT_DESCRIPTION).toBe(lines[0]!.replace(' / ', ''));
    expect(get('index.html').title).toBe('ClinkAI');
    expect(get('index.html').meta.description).toBe(DEFAULT_DESCRIPTION);
  });

  it('预约沟通：标题照设计稿，描述照抄 copy.md 这一页的介绍', () => {
    const items = copyItems('## 子页面 · 预约沟通');
    const page = get('contact/index.html');

    expect(page.title).toBe('ClinkAI 预约沟通');
    expect(items).toContain(page.meta.description);
    expect(page.meta.description).not.toBe(DEFAULT_DESCRIPTION);
  });

  it('隐私说明和 404：用各自的草稿文案（src/data/）', () => {
    expect(get('privacy/index.html').title).toBe(PRIVACY_TITLE);
    expect(get('privacy/index.html').meta.description).toBe(
      PRIVACY_DESCRIPTION,
    );
    expect(get('404.html').title).toBe(NOT_FOUND_TITLE);
  });

  it('标题和描述里不出现不能写的话', () => {
    for (const { file, title, meta } of all()) {
      for (const word of ['飞轮', '越用越准', '品类经验库', '复盘', '待填']) {
        expect(`${title} ${meta.description}`, file).not.toContain(word);
      }
    }
  });
});

describe('站点地图和 robots.txt（按渲染出来的页面生成）', () => {
  it('站点地图里有首页、预约沟通、隐私说明，没有部件陈列页、素材陈列页和 404 页', () => {
    const xml = sitemapXml(all());

    for (const path of ['/', '/contact/', '/privacy/']) {
      expect(xml).toContain(`<loc>${SITE_URL}${path}</loc>`);
    }
    expect(xml).not.toContain('/parts/');
    expect(xml).not.toContain('/media/');
    expect(xml).not.toContain('404');
  });

  it('robots.txt 不让抓接口、部件陈列页和素材陈列页，指出站点地图', () => {
    const robots = robotsTxt(all());

    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('Disallow: /parts/');
    expect(robots).toContain('Disallow: /media/');
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
    expect(robots).not.toMatch(/^Disallow: \/$/m);
  });
});

describe('分享图', () => {
  // Astro 把 public/ 下的文件原样拷到站点根目录
  const png = readFileSync(`public${SHARE_IMAGE.path}`);

  it('是 PNG，尺寸和 <head> 里写的一致', () => {
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(SHARE_IMAGE.width);
    expect(png.readUInt32BE(20)).toBe(SHARE_IMAGE.height);
  });

  it('不超过 300 KB', () => {
    expect(png.length).toBeLessThan(300 * 1024);
  });
});
