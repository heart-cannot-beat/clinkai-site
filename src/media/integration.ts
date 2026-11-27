// 构建检查：astro build 写完 dist/ 之后，把每个页面里的图片过一遍。
// - 首屏图片（没有 loading="lazy" 的）总体积超过上限 → 构建失败；
// - 有图片没走图片管线（没有 AVIF、WebP 兜底、多尺寸）→ 构建失败。
// 规则和上限在 budget.ts，说明在 docs/media.md。npm run verify 最后一步就是构建，CI 和部署都会跑到。

import type { AstroIntegration } from 'astro';
import { readdir, readFile, stat } from 'node:fs/promises';
import {
  FIRST_SCREEN_BUDGET,
  REFERENCE_VIEWPORT,
  firstScreen,
  formatKB,
  pageImages,
} from './budget';

export function imageChecks(): AstroIntegration {
  return {
    name: 'clinkai:image-checks',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const pages = (await readdir(dir, { recursive: true }))
          .filter((file) => file.endsWith('.html'))
          .sort();
        const sizes = new Map<string, number>();
        const errors: string[] = [];

        for (const page of pages) {
          const images = pageImages(await readFile(new URL(page, dir), 'utf8'));

          for (const image of images) {
            for (const problem of image.problems) {
              errors.push(`${page}：${problem}：${image.tag}`);
            }
          }

          const urls = images
            .filter((image) => image.eager)
            .flatMap((image) => image.picks.map((pick) => pick.url));
          for (const url of urls) {
            if (sizes.has(url)) continue;
            if (!url.startsWith('/') || url.startsWith('//')) {
              errors.push(`${page}：首屏图片要用站内的文件：${url}`);
              sizes.set(url, 0);
              continue;
            }
            const file = new URL(`.${url.split(/[?#]/)[0]}`, dir);
            sizes.set(url, (await stat(file)).size);
          }

          const report = firstScreen(images, (url) => sizes.get(url) ?? 0);
          if (report.images.length === 0) continue;
          const line = `${page}：首屏图片 ${report.images.length} 张，共 ${formatKB(report.total)}（上限 ${formatKB(FIRST_SCREEN_BUDGET)}，按 ${REFERENCE_VIEWPORT.width} 宽 ${REFERENCE_VIEWPORT.dpr} 倍屏、每张取最重的格式）`;
          if (report.overBudget) {
            errors.push(
              [
                `${line} 超了`,
                ...report.images.map(
                  (image) => `  ${formatKB(image.bytes)}  ${image.url}`,
                ),
              ].join('\n'),
            );
          } else {
            logger.info(line);
          }
        }

        if (errors.length > 0) {
          throw new Error(`图片检查没过：\n${errors.join('\n')}`);
        }
        logger.info(`${pages.length} 个页面的图片都走了图片管线`);
      },
    },
  };
}
