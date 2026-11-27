import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import designScreen from '../../design/screens/02-wall.html?raw';
import { preparePicture } from '../media/picture';
import { pebblesoundWall, wallImageFiles } from './config';
import { renderWallTiles } from './generate';
import { versionWall } from './index';
import VersionWall from './VersionWall.astro';

async function render(props: { decorative?: boolean } = {}): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(VersionWall, { props });
}

const TILE = 'overflow: hidden; background: ';
const designTiles = designScreen
  .split('\n')
  .filter((line) => line.includes(TILE));
const siteTiles = renderWallTiles(versionWall).split('\n');

/**
 * 只留设计上要对得上的东西：每张小图的位置、尺寸、底色和字色，里面的文字和排版，
 * 每张图的内联样式（位置、大小、裁切）。图片元素自己的属性去掉：
 * 站点上的图换成了 <picture>，多了 AVIF 的 <source>、srcset、sizes、loading 这些，
 * 地址也和设计稿的相对路径不同。哪张图放在哪里，另外按文件名比。
 */
function layoutOnly(html: string): string {
  return html
    .replace(/<picture><source [^>]*>(<img [^>]*>)<\/picture>/g, '$1')
    .replace(/<img [^>]*?style="([^"]*)"[^>]*>/g, '<img style="$1">');
}

const unescape = (value: string) => value.replaceAll('&amp;', '&');

describe('VersionWall 组件：构建时输出静态 HTML', () => {
  it('输出 40 张小图，内容就是生成器的结果', async () => {
    const html = await render();

    expect(html.match(/overflow: hidden; background: /g)).toHaveLength(40);
    expect(html).toContain(renderWallTiles(versionWall));
  });

  it('除了图片元素的属性，和设计稿第 2 屏里的 40 张一字不差', () => {
    expect(designTiles).toHaveLength(40);
    expect(siteTiles.map(layoutOnly)).toEqual(designTiles.map(layoutOnly));
  });

  it('每个位置上放的是设计稿里的那张图', async () => {
    const fileBySrc = new Map<string, string>();
    for (const file of wallImageFiles(pebblesoundWall)) {
      fileBySrc.set((await preparePicture(file)).src, file);
    }
    const designFiles = designTiles.map((line) =>
      [...line.matchAll(/<img src="\.\.\/assets\/img\/([^"]+)"/g)].map(
        (match) => match[1],
      ),
    );
    const siteFiles = siteTiles.map((line) =>
      [...line.matchAll(/<img src="([^"]+)"/g)].map((match) =>
        fileBySrc.get(unescape(match[1])),
      ),
    );

    expect(designFiles.flat().length).toBeGreaterThan(0);
    expect(siteFiles).toEqual(designFiles);
  });

  it('墙里的图都走图片管线：AVIF 在前、WebP 兜底，多尺寸，延迟加载', () => {
    const html = renderWallTiles(versionWall);
    const pictures = [
      ...html.matchAll(/<picture>(<source [^>]*>)(<img [^>]*>)<\/picture>/g),
    ];

    expect(pictures).toHaveLength(html.match(/<img /g)!.length);
    expect(pictures).toHaveLength(
      designTiles.join('\n').match(/<img /g)!.length,
    );
    for (const [, source, img] of pictures) {
      expect(source).toContain('type="image/avif"');
      for (const tag of [source, img]) {
        const srcset = /srcset="([^"]+)"/.exec(tag)?.[1] ?? '';
        expect(srcset.split(', ').length).toBeGreaterThanOrEqual(2);
        expect(tag).toMatch(/ sizes="\(min-width: 1440px\) [\d.]+vw, \d+px"/);
      }
      expect(img).toContain('loading="lazy"');
      expect(img).toContain('decoding="async"');
      expect(img).toContain('alt=""');
      expect(img).not.toContain('fetchpriority');
    }
  });

  it('整面墙是一张图，说明以「示例」开头，和设计稿一致', async () => {
    const html = await render();
    const designLabel = /<div role="img" aria-label="([^"]+)"/.exec(
      designScreen,
    )?.[1];

    expect(designLabel).toMatch(/^示例：/);
    expect(html).toContain(`role="img"`);
    expect(html).toContain(`aria-label="${designLabel}"`);
    expect(html).not.toContain('aria-hidden');
  });

  it('只当背景用时对读屏软件隐藏（第 3 屏的灰墙）', async () => {
    const html = await render({ decorative: true });

    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain('aria-label');
    expect(html.match(/overflow: hidden; background: /g)).toHaveLength(40);
  });

  it('页面里没有脚本：线上不跑任何生成逻辑', async () => {
    expect(await render()).not.toMatch(/<script/i);
  });
});
