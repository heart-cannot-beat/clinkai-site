// 上线基础（P-06）的构建步骤：astro build 写完 dist/ 之后，
// - 检查每个页面都有标题、描述和分享卡片，有 404.html，分享图在；
// - 按构建出来的页面生成 sitemap.xml 和 robots.txt（不收录的页面不进站点地图）。
// 页面收不收录只看它自己 <head> 里的 noindex（BaseLayout 的 noindex 属性），这里不另外维护名单。
// 规则在 pages.ts，说明在 docs/launch-basics.md。

import type { AstroIntegration } from 'astro';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import {
  NOT_FOUND_FILE,
  pageProblems,
  readPage,
  ROBOTS_FILE,
  robotsTxt,
  SITEMAP_FILE,
  sitemapPages,
  sitemapXml,
} from './pages';
import { SHARE_IMAGE } from './site';

export function launchBasics(): AstroIntegration {
  return {
    name: 'clinkai:launch-basics',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const files = (await readdir(dir, { recursive: true }))
          .filter((file) => file.endsWith('.html'))
          .sort();
        const pages = await Promise.all(
          files.map(async (file) =>
            readPage(file, await readFile(new URL(file, dir), 'utf8')),
          ),
        );

        const errors = pages.flatMap((page) =>
          pageProblems(page).map((problem) => `${page.file}：${problem}`),
        );
        if (!pages.some((page) => page.file === NOT_FOUND_FILE)) {
          errors.push(`没有 ${NOT_FOUND_FILE}（src/pages/404.astro）`);
        }
        const shareImage = new URL(`.${SHARE_IMAGE.path}`, dir);
        if (!(await stat(shareImage).catch(() => null))?.isFile()) {
          errors.push(`没有分享图 ${SHARE_IMAGE.path}（public/ 下）`);
        }
        if (errors.length > 0) {
          throw new Error(`上线基础检查没过：\n${errors.join('\n')}`);
        }

        await writeFile(new URL(SITEMAP_FILE, dir), sitemapXml(pages));
        await writeFile(new URL(ROBOTS_FILE, dir), robotsTxt(pages));

        const listed = sitemapPages(pages).map((page) => page.path);
        logger.info(
          `${pages.length} 个页面都有标题、描述和分享卡片；${SITEMAP_FILE} 里 ${listed.length} 个：${listed.join(' ')}`,
        );
      },
    },
  };
}
