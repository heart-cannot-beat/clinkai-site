// 构建产物里的页面：读出每个页面 <head> 里的标题、描述和分享卡片，
// 检查有没有缺的，再生成站点地图和 robots.txt。
// 这里只解析 HTML、拼文本；读写文件和让构建失败在 integration.ts。

import { canonicalPath } from './meta';
import { absoluteUrl, SITE_URL } from './site';

/** Astro 把 src/pages/404.astro 构建成这个文件；Cloudflare 找不到路径时返回它 */
export const NOT_FOUND_FILE = '404.html';

export const SITEMAP_FILE = 'sitemap.xml';
export const ROBOTS_FILE = 'robots.txt';

/** 不是页面、但也不该被抓取的路径：表单接口 */
export const ALWAYS_DISALLOWED = ['/api/'] as const;

/** 每个页面都要有的分享卡片标签（Open Graph 用 property，Twitter Card 用 name） */
export const REQUIRED_SHARE_TAGS = [
  'og:type',
  'og:site_name',
  'og:title',
  'og:description',
  'og:image',
  'twitter:card',
  'twitter:title',
  'twitter:description',
  'twitter:image',
] as const;

/** 构建产物里的一个页面 */
export interface BuiltPage {
  /** dist/ 里的文件，比如 contact/index.html */
  file: string;
  /** 站点上的路径，比如 /contact/ */
  path: string;
  title: string | null;
  /** <meta name="robots"> 里带 noindex */
  noindex: boolean;
  /** <link rel="canonical"> 的地址 */
  canonical: string | null;
  /** <meta> 的 name 或 property → content */
  meta: Record<string, string>;
  /** <head> 的原文，用来查不该出现的地址 */
  head: string;
}

function decode(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#34;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function attributes(tag: string): Record<string, string> {
  const found: Record<string, string> = {};
  const body = tag.replace(/^<\w+/, '').replace(/\/?>$/, '');
  for (const match of body.matchAll(
    /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
  )) {
    found[match[1]!.toLowerCase()] = decode(
      match[2] ?? match[3] ?? match[4] ?? '',
    );
  }
  return found;
}

/** dist/ 里的文件名 → 站点上的路径：index.html → /，contact/index.html → /contact/ */
export function routePath(file: string): string {
  return canonicalPath(`/${file.replaceAll('\\', '/')}`);
}

export function readPage(file: string, html: string): BuiltPage {
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';
  const meta: Record<string, string> = {};
  for (const match of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = attributes(match[0]);
    const key = tag.name ?? tag.property;
    if (key && tag.content !== undefined) meta[key] = tag.content;
  }

  let canonical: string | null = null;
  for (const match of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = attributes(match[0]);
    if (tag.rel === 'canonical' && tag.href) canonical = tag.href;
  }

  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];

  return {
    file: file.replaceAll('\\', '/'),
    path: routePath(file),
    title: title === undefined ? null : decode(title).trim(),
    noindex: /\bnoindex\b/i.test(meta.robots ?? ''),
    canonical,
    meta,
    head,
  };
}

/** 这个页面的 <head> 里缺什么、哪里不对。空的就是没问题 */
export function pageProblems(page: BuiltPage): string[] {
  const problems: string[] = [];

  if (!page.title) problems.push('没有 <title>');
  if (!page.meta.description) problems.push('没有描述（meta description）');
  for (const tag of REQUIRED_SHARE_TAGS) {
    if (!page.meta[tag]) problems.push(`分享卡片缺 ${tag}`);
  }

  for (const tag of ['og:image', 'twitter:image'] as const) {
    const url = page.meta[tag];
    if (url && !url.startsWith(`${SITE_URL}/`)) {
      problems.push(`${tag} 要是 ${SITE_URL} 下的完整地址：${url}`);
    }
  }

  if (/workers\.dev/i.test(page.head)) {
    problems.push('<head> 里出现了 workers.dev 地址（账号子域名是个人信息）');
  }

  if (page.noindex) {
    if (page.canonical) problems.push('不收录的页面不要写 canonical');
    return problems;
  }

  // 会被收录的页面：canonical 和 og:url 都指向它自己在正式域名下的地址
  const expected = absoluteUrl(page.path);
  if (page.canonical !== expected) {
    problems.push(
      `canonical 应该是 ${expected}，现在是 ${page.canonical ?? '（没写）'}`,
    );
  }
  if (page.meta['og:url'] !== expected) {
    problems.push(
      `og:url 应该是 ${expected}，现在是 ${page.meta['og:url'] ?? '（没写）'}`,
    );
  }
  return problems;
}

const isNotFound = (page: BuiltPage) => page.file === NOT_FOUND_FILE;

/** 进站点地图的页面：会被收录的，按路径排序。404 页和 noindex 的页面不进 */
export function sitemapPages(pages: readonly BuiltPage[]): BuiltPage[] {
  return pages
    .filter((page) => !page.noindex && !isNotFound(page))
    .sort((a, b) => a.path.localeCompare(b.path));
}

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export function sitemapXml(pages: readonly BuiltPage[]): string {
  const urls = sitemapPages(pages).map(
    (page) => `  <url><loc>${escapeXml(absoluteUrl(page.path))}</loc></url>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * robots.txt：表单接口和不收录的页面（部件陈列页这类）不让抓，其余放开，并指出站点地图。
 * 404 页不用列：它没有固定的地址。
 */
export function robotsTxt(pages: readonly BuiltPage[]): string {
  const disallowed = [
    ...ALWAYS_DISALLOWED,
    ...pages
      .filter((page) => page.noindex && !isNotFound(page))
      .map((page) => page.path),
  ].sort();
  return [
    'User-agent: *',
    ...disallowed.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${absoluteUrl(`/${SITEMAP_FILE}`)}`,
    '',
  ].join('\n');
}
