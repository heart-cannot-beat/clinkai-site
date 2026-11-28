// 每个页面 <head> 里的地址怎么算。标签本身写在 src/layouts/BaseLayout.astro。

import { absoluteUrl } from './site';

/**
 * 页面在站点上的规范路径：目录形式，以斜杠结尾。
 * 构建出来的文件是 contact/index.html，Cloudflare 把 /contact 跳到 /contact/，
 * 所以 /contact、/contact/、/contact/index.html 都算 /contact/。
 */
export function canonicalPath(pathname: string): string {
  const path = pathname
    .replace(/\/index\.html$/, '/')
    .replace(/\.html$/, '')
    .replace(/\/+$/, '');
  return `${path}/`;
}

/** 页面的规范地址（带域名）。canonical 和 og:url 用同一个 */
export function canonicalUrl(pathname: string): string {
  return absoluteUrl(canonicalPath(pathname));
}
