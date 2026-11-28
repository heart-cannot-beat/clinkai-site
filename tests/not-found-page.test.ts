import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { unstable_readConfig } from 'wrangler';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  NOT_FOUND_HEADING,
  NOT_FOUND_HOME,
  NOT_FOUND_LEAD,
  NOT_FOUND_TITLE,
} from '../src/data/not-found';
import NotFoundPage from '../src/pages/404.astro';

// 404 页（P-06）。文字是草稿（src/data/not-found.ts），这里只查页面照着那份文字渲染、结构对。

let page: string;

beforeAll(async () => {
  const container = await AstroContainer.create();
  page = await container.renderToString(NotFoundPage);
});

// 去掉标签，只看读得到的文字
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const main = (html: string) => html.match(/<main[\s\S]*<\/main>/)?.[0] ?? '';

describe('404 页', () => {
  it('Cloudflare 找不到路径时返回 404 页（wrangler.jsonc）', () => {
    const config = unstable_readConfig({ config: 'wrangler.jsonc' });

    expect(config.assets?.not_found_handling).toBe('404-page');
  });

  it('不让搜索引擎收录', () => {
    expect(page).toContain(`<title>${NOT_FOUND_TITLE}</title>`);
    expect(page).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it('页面上的字就是草稿里的那几句，不多不少', () => {
    expect(text(main(page))).toBe(
      [
        ...NOT_FOUND_HEADING,
        NOT_FOUND_LEAD,
        NOT_FOUND_HOME.label,
        NOT_FOUND_HOME.arrow,
      ].join(' '),
    );
  });

  it('只有一个一级标题，标成英文', () => {
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(text(page.match(/<h1[^>]*lang="en"[\s\S]*?<\/h1>/)?.[0] ?? '')).toBe(
      NOT_FOUND_HEADING.join(' '),
    );
  });

  it('有回首页的链接，箭头对读屏隐藏', () => {
    expect(NOT_FOUND_HOME.href).toBe('/');
    expect(page).toMatch(
      /<a[^>]*class="home-link[^"]*"[^>]*href="\/"[^>]*>\s*回首页\s*<span aria-hidden="true"[^>]*>→<\/span>/,
    );
  });

  it('普通页头，哪一项都不标成当前页', () => {
    expect(page).toMatch(/class="[^"]*\bsite-header\b[^"]*\bplain\b/);
    expect(page).not.toContain('aria-current');
    expect(page).toMatch(/<a[^>]*class="cta[^"]*"[^>]*href="\/contact\/"/);
  });

  it('角落部件：有圆点和菜单按钮，没有 SCROLL', () => {
    expect(page).toContain('sound-dot');
    expect(page).toContain('aria-label="打开菜单"');
    expect(page).not.toContain('SCROLL');
  });

  it('样式和脚本都用站内的绝对地址：这一页会在任意路径下返回', () => {
    const urls = [...page.matchAll(/\s(?:href|src)="([^"]+)"/g)].map(
      (match) => match[1]!,
    );

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url, url).toMatch(/^(\/|#|https:\/\/clinkai\.app\/)/);
    }
  });

  it('不出现不能写的话和【待填】', () => {
    for (const word of ['飞轮', '越用越准', '品类经验库', '复盘', '待填']) {
      expect(text(page)).not.toContain(word);
    }
  });
});
