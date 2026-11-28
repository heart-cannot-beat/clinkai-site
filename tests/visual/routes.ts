// 截图对比时浏览器的所有请求都在这里接住，从磁盘上答，不起服务器、不连外网：
// - 站点：构建产物 dist/
// - 设计稿：design/ 交接包（只读，不改里面的文件）
// - 设计稿里谷歌字体的那条在线样式表：换成站点自托管的那份 Inter Tight
// - 视频文件：不给，两边都停在封面上
// - 其余地址：拦掉并记下来，测试会因此失败
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Route } from '@playwright/test';

/** 站点和设计稿各用一个假域名，请求不会真的发出去 */
export const SITE_ORIGIN = 'http://site.test';
export const DESIGN_ORIGIN = 'http://design.test';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIST = path.join(ROOT, 'dist');
const DESIGN = path.join(ROOT, 'design');

// 站点的字体：BaseLayout 里引的就是这个包的 400.css
const FONT_CSS = createRequire(import.meta.url).resolve(
  '@fontsource/inter-tight/400.css',
);
const FONT_DIR = path.dirname(FONT_CSS);
/** 字体文件挂在设计稿的域名下，和设计稿同源 */
const FONT_PREFIX = '/__inter-tight/';

const GOOGLE_FONTS_HOST = 'fonts.googleapis.com';
const VIDEO = /\.(webm|mp4)$/;

/** 一次测试里记下来的请求情况 */
export interface Traffic {
  /** 请求了站外地址（已拦掉） */
  external: string[];
  /** 本地没有这个文件 */
  missing: string[];
  /** 没给的视频文件 */
  videos: string[];
}

/**
 * 设计稿用的字体样式表：站点那份 Inter Tight 的 @font-face 原样拿来，只把字体文件的地址改到本地。
 * 设计稿另外要的 Noto Sans SC 不提供：站点不自托管中文字体，两边的中文都落到这台机器的系统字体。
 */
async function designFontCss(): Promise<string> {
  const css = await readFile(FONT_CSS, 'utf8');
  return css.replaceAll(
    'url(./files/',
    `url(${DESIGN_ORIGIN}${FONT_PREFIX}files/`,
  );
}

/** 把地址里的路径对到磁盘上的文件；跑到根目录外面、或者文件不存在，返回 null */
async function resolveFile(
  root: string,
  pathname: string,
): Promise<string | null> {
  let file = path.join(root, decodeURIComponent(pathname));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    return (await stat(file)).isFile() ? file : null;
  } catch {
    return null;
  }
}

async function serve(
  route: Route,
  root: string,
  pathname: string,
  traffic: Traffic,
): Promise<void> {
  const url = route.request().url();
  if (VIDEO.test(pathname)) {
    traffic.videos.push(url);
    return route.abort('blockedbyclient');
  }
  const file = await resolveFile(root, pathname);
  if (!file) {
    traffic.missing.push(url);
    return route.fulfill({ status: 404, body: 'Not found' });
  }
  return route.fulfill({ path: file });
}

/** 接管这个浏览器上下文里的所有请求。返回的对象在测试过程中持续记录 */
export async function serveFromDisk(context: BrowserContext): Promise<Traffic> {
  const traffic: Traffic = { external: [], missing: [], videos: [] };
  const fontCss = await designFontCss();

  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());

    if (url.origin === SITE_ORIGIN) {
      return serve(route, DIST, url.pathname, traffic);
    }
    if (url.origin === DESIGN_ORIGIN) {
      return url.pathname.startsWith(FONT_PREFIX)
        ? serve(
            route,
            FONT_DIR,
            url.pathname.slice(FONT_PREFIX.length),
            traffic,
          )
        : serve(route, DESIGN, url.pathname, traffic);
    }
    if (url.hostname === GOOGLE_FONTS_HOST) {
      return route.fulfill({ contentType: 'text/css', body: fontCss });
    }

    traffic.external.push(url.href);
    return route.abort('blockedbyclient');
  });

  return traffic;
}
