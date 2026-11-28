import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import wallScreen from '../../design/screens/02-wall.html?raw';
import winnerScreen from '../../design/screens/03-winner.html?raw';
import designWall from '../../design/wall/tiles.json';
import { preparePicture } from '../media/picture';
import { versionWall } from './index';
import { designScreenTiles } from './test-helpers';
import VersionWall from './VersionWall.astro';
import { renderWallTiles, wallImageFiles } from './wall';

async function render(props: { decorative?: boolean } = {}): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(VersionWall, { props });
}

/** 组件最外层那个 div 的开标签。母版里的小圆点自己带 aria-hidden，不能拿整段 HTML 来查 */
function wrapperTag(html: string): string {
  return /<div[^>]*class="version-wall[^>]*>/.exec(html)?.[0] ?? '';
}

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

const TILE = /overflow: hidden; background: /g;
// 胜出的那一张（右下的钴蓝横幅）在设计稿画布上的位置
const WINNER_BOX = 'left: 1162px; top: 545px; width: 316px; height: 165px';

// 两种用法各对一屏设计稿：第 2 屏是整面墙，第 3 屏的灰墙少了胜出的那一张
const walls = [
  {
    name: '第 2 屏的墙',
    props: {},
    count: 40,
    designTiles: designScreenTiles(wallScreen),
    siteTiles: renderWallTiles(versionWall).split('\n'),
  },
  {
    name: '第 3 屏的灰墙（decorative）',
    props: { decorative: true },
    count: 39,
    designTiles: designScreenTiles(winnerScreen),
    siteTiles: renderWallTiles(versionWall, { withoutWinner: true }).split(
      '\n',
    ),
  },
];

describe.each(walls)(
  'VersionWall 组件，$name：构建时输出静态 HTML',
  ({ props, count, designTiles, siteTiles }) => {
    it('小图的张数对', async () => {
      const html = await render(props);

      expect(designTiles).toHaveLength(count);
      expect(siteTiles).toHaveLength(count);
      expect(html.match(TILE)).toHaveLength(count);
      expect(html).toContain(siteTiles.join('\n'));
    });

    it('除了图片元素的属性，和设计稿里的小图一字不差', () => {
      expect(siteTiles.map(layoutOnly)).toEqual(designTiles.map(layoutOnly));
    });

    it('每个位置上放的是设计稿里的那张图', async () => {
      const fileBySrc = new Map<string, string>();
      for (const file of wallImageFiles(designWall)) {
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
      const html = siteTiles.join('\n');
      const pictures = [
        ...html.matchAll(/<picture>(<source [^>]*>)(<img [^>]*>)<\/picture>/g),
      ];

      expect(pictures).toHaveLength(html.match(/<img /g)!.length);
      expect(pictures).toHaveLength(
        designTiles.join('\n').match(/<img /g)!.length,
      );
      expect(html).not.toContain('../assets/');
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

    it('页面里没有脚本：线上不跑任何生成逻辑', async () => {
      expect(await render(props)).not.toMatch(/<script/i);
    });
  },
);

describe('VersionWall 组件：两种用法的区别', () => {
  it('整面墙是一张图，说明以「示例」开头，和设计稿一致', async () => {
    const wrapper = wrapperTag(await render());
    const designLabel = /<div role="img" aria-label="([^"]+)"/.exec(
      wallScreen,
    )?.[1];

    expect(designLabel).toMatch(/^示例：/);
    expect(wrapper).toContain(`role="img"`);
    expect(wrapper).toContain(`aria-label="${designLabel}"`);
    expect(wrapper).not.toContain('aria-hidden');
  });

  it('只当背景用时对读屏软件隐藏（第 3 屏的灰墙）', async () => {
    const wrapper = wrapperTag(await render({ decorative: true }));

    expect(wrapper).toContain('aria-hidden="true"');
    expect(wrapper).not.toContain('role="img"');
    expect(wrapper).not.toContain('aria-label');
  });

  it('灰墙里胜出的那一张不输出，它的位置空着', async () => {
    expect(await render()).toContain(WINNER_BOX);
    expect(await render({ decorative: true })).not.toContain(WINNER_BOX);
  });

  it('按显示大小写 sizes：母版铺满 500×500 的框，胜出的横幅里耳机盒宽 158', () => {
    const tiles = renderWallTiles(versionWall).split('\n');
    const mother = tiles.find((line) =>
      line.includes('left: 434px; top: 170px; width: 500px; height: 500px'),
    );
    const winner = tiles.find((line) => line.includes(WINNER_BOX));

    // pebble_trumpet.jpg 是 1536×1024，铺满 500 高的框要铺开 750 宽
    expect(mother).toContain(' sizes="(min-width: 1440px) 52.08vw, 750px"');
    expect(winner).toContain(' sizes="(min-width: 1440px) 10.97vw, 158px"');
  });
});
