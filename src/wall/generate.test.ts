import { describe, expect, it } from 'vitest';
import manifest from '../../design/assets/manifest.json';
import wallScreen from '../../design/screens/02-wall.html?raw';
import winnerScreen from '../../design/screens/03-winner.html?raw';
import designWall from '../../design/wall/tiles.json';
import { pebblesoundWall, type WallConfig } from './config';
import { generateWall, packGrid, renderWallTiles } from './generate';

// 基准是设计交接包里的定稿数据 design/wall/tiles.json 和每屏的 HTML 源。
// 设计侧重新导出后这里的测试会挂，按新数据同步 config.ts 和 templates.ts。

// 设计稿里图片的相对路径。用它生成，结果应当和 tiles.json 一字不差
const designImage = (file: string) => `../assets/img/${file}`;

function withSeed(seed: number): WallConfig {
  return { ...pebblesoundWall, grid: { ...pebblesoundWall.grid, seed } };
}

/** 从设计稿某一屏的 HTML 源里取出墙上的小图，一行一张 */
function designScreenTiles(screen: string): string[] {
  return screen
    .split('\n')
    .filter((line) =>
      /^<div style="position: absolute; left: \d+px; top: \d+px; width: \d+px; height: \d+px; overflow: hidden; background: /.test(
        line,
      ),
    );
}

describe('版本墙生成器：以 design/wall/tiles.json 为准', () => {
  const wall = generateWall(pebblesoundWall, designImage);

  it('固定种子切出来的格子和设计稿一致', () => {
    expect(packGrid(pebblesoundWall)).toEqual(
      designWall.tiles.map(({ col, row, colSpan, rowSpan }) => ({
        col,
        row,
        colSpan,
        rowSpan,
      })),
    );
  });

  it('同样的种子和配置，生成的每一张都和 tiles.json 一样', () => {
    expect(wall.tiles).toEqual(designWall.tiles);
  });

  it('生成 40 张', () => {
    expect(wall.tiles).toHaveLength(40);
    expect(wall.tiles.map((tile) => tile.index)).toEqual(
      Array.from({ length: 40 }, (_, index) => index),
    );
  });

  it('格子参数和 tiles.json 一致', () => {
    expect(wall.grid).toEqual(pebblesoundWall.grid);
    expect(designWall.grid).toMatchObject(wall.grid);
  });

  it('同样的输入再生成一次，结果不变', () => {
    expect(generateWall(pebblesoundWall, designImage)).toEqual(wall);
  });

  it('换一个种子，格子划分就不一样', () => {
    expect(packGrid(withSeed(171))).not.toEqual(packGrid(pebblesoundWall));
  });

  it.each([0, 1, 170, 171, 2026])(
    '种子 %i：格子铺满、不重叠，计数块的位置空着',
    (seed) => {
      const config = withSeed(seed);
      const covered = new Map<string, number>();
      for (const cell of packGrid(config)) {
        for (let col = cell.col; col < cell.col + cell.colSpan; col += 1) {
          for (let row = cell.row; row < cell.row + cell.rowSpan; row += 1) {
            const key = `${col},${row}`;
            covered.set(key, (covered.get(key) ?? 0) + 1);
          }
        }
      }

      const reserved = new Set(
        config.reserved.map(({ col, row }) => `${col},${row}`),
      );
      for (let col = 0; col < config.grid.cols; col += 1) {
        for (let row = 0; row < config.grid.rows; row += 1) {
          const key = `${col},${row}`;
          expect(covered.get(key) ?? 0, `格子 ${key}`).toBe(
            reserved.has(key) ? 0 : 1,
          );
        }
      }
    },
  );

  it('没有模板的尺寸会报错，不会悄悄生成空白小图', () => {
    const config: WallConfig = {
      ...pebblesoundWall,
      shapes: [{ colSpan: 3, rowSpan: 1, weight: 1 }],
    };

    expect(() => generateWall(config, designImage)).toThrow(/3x1/);
  });
});

describe('版本墙的三个计数：从生成结果里数，不手写', () => {
  const wall = generateWall(pebblesoundWall, designImage);

  it('现在是 40 个版本、7 种语言、4 种尺寸，和 tiles.json 一致', () => {
    expect(wall.counts).toEqual({ versions: 40, languages: 7, sizes: 4 });
    expect(wall.counts).toEqual(designWall.counts);
    expect(wall.languages).toEqual(designWall.languages);
    expect(wall.sizes).toEqual(designWall.sizes);
  });

  it('和从小图里重新数一遍的结果一致', () => {
    const languages = new Set(
      wall.tiles.flatMap((tile) =>
        [...tile.html.matchAll(/ lang="([^"]+)"/g)].map((match) => match[1]),
      ),
    );
    const sizes = new Set(wall.tiles.map((tile) => tile.size));

    expect(wall.counts).toEqual({
      versions: wall.tiles.length,
      languages: languages.size,
      sizes: sizes.size,
    });
    expect(wall.languages).toEqual([...languages].sort());
    expect(wall.sizes).toEqual([...sizes].sort());
  });

  it('配置里只留英文标题，语言数就变成 1', () => {
    const englishOnly: WallConfig = {
      ...pebblesoundWall,
      headlines: pebblesoundWall.headlines.filter(
        (headline) => headline.lang === 'en',
      ),
    };

    const { counts, languages } = generateWall(englishOnly, designImage);

    expect(counts).toEqual({ versions: 40, languages: 1, sizes: 4 });
    expect(languages).toEqual(['en']);
  });

  it('配置里只留 1x1，版本数和尺寸数跟着变', () => {
    const squaresOnly: WallConfig = {
      ...pebblesoundWall,
      shapes: [{ colSpan: 1, rowSpan: 1, weight: 1 }],
    };

    const { counts, sizes } = generateWall(squaresOnly, designImage);

    // 10 列 x 6 行，去掉留给计数块的 3 格
    expect(counts).toMatchObject({ versions: 57, sizes: 1 });
    expect(sizes).toEqual(['1x1']);
  });
});

describe('版本墙输出的静态 HTML', () => {
  const wall = generateWall(pebblesoundWall, designImage);

  it('和设计稿第 2 屏里的 40 张逐字一致', () => {
    expect(renderWallTiles(wall).split('\n')).toEqual(
      designScreenTiles(wallScreen),
    );
  });

  it('第 3 屏背后的灰墙是同一份', () => {
    expect(renderWallTiles(wall).split('\n')).toEqual(
      designScreenTiles(winnerScreen),
    );
  });

  it('图片路径换成站点自己的，其余不变', () => {
    const site = generateWall(pebblesoundWall, (file) => `/_site/wall/${file}`);
    const html = renderWallTiles(site);

    expect(html).not.toContain('../assets/img/');
    expect(html.replaceAll('/_site/wall/', '../assets/img/')).toBe(
      renderWallTiles(wall),
    );
  });

  it('中日韩标题按词包成 inline-block，只在词和词之间换行', () => {
    const html = renderWallTiles(wall);

    expect(html).toContain(
      '<span lang="ja"><span style="display: inline-block">街を、</span><span style="display: inline-block">ミュート。</span></span>',
    );
    expect(html).toContain(
      '<span lang="ko"><span style="display: inline-block">도시를</span> <span style="display: inline-block">음소거.</span></span>',
    );
  });

  it('右下角被菜单按钮盖住的那一格不放标题', () => {
    const corner = wall.tiles.find((tile) => tile.col === 9 && tile.row === 5);

    expect(corner).toBeDefined();
    expect(corner?.html).not.toContain('lang=');
  });

  it('标题里的特殊字符会转义', () => {
    const config: WallConfig = {
      ...pebblesoundWall,
      headlines: [{ lang: 'en', text: 'Quiet & <small>' }],
    };

    const html = renderWallTiles(generateWall(config, designImage));

    expect(html).toContain('<span lang="en">Quiet &amp; &lt;small&gt;</span>');
    expect(html).not.toContain('<small>');
  });
});

describe('广告屏的墙里没有达人素材（CLAUDE.md 规则 4）', () => {
  const wall = generateWall(pebblesoundWall, designImage);
  const html = renderWallTiles(wall);
  // 清单里的 file 是相对 design/assets/ 的路径，例如 img/pebble_cut_open.webp
  const usedFiles = [
    ...new Set(
      [...html.matchAll(/<img src="\.\.\/assets\/([^"]+)"/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  const assets = new Map(manifest.assets.map((asset) => [asset.file, asset]));

  it('墙里的图片全部是 <img>，数量对得上', () => {
    expect(usedFiles.length).toBeGreaterThan(0);
    expect(html.match(/<img /g)).toHaveLength(
      html.match(/<img src="\.\.\/assets\/img\//g)?.length ?? 0,
    );
    expect(html).not.toContain('url(');
  });

  it('用到的图都在图片清单里，类型只有广告图和产品图', () => {
    for (const file of usedFiles) {
      expect(assets.get(file)?.kind, file).toMatch(
        /^(ad-image|product-cutout)$/,
      );
    }
  });

  it('清单里的达人素材（视频、视频封面帧、头像）一个都不在墙里', () => {
    const creatorAssets = manifest.assets.filter((asset) =>
      asset.kind.startsWith('creator-'),
    );

    expect(creatorAssets.length).toBeGreaterThan(0);
    for (const asset of creatorAssets) {
      const name = asset.file.split('/').pop() as string;
      expect(html, asset.file).not.toContain(name);
    }
  });

  it('墙里没有视频标签，也没有视频文件', () => {
    expect(html).not.toMatch(/<video|<source|\.mp4|\.webm/i);
  });

  it('只用虚构品牌 Pebblesound 的示例素材', () => {
    for (const file of usedFiles) {
      expect(assets.get(file)?.brand, file).toBe('Pebblesound');
    }
  });

  it('配置里登记的图片正好是墙里用到的那一批，没有多余的', () => {
    const configured = [
      ...Object.values(pebblesoundWall.cutouts),
      ...Object.values(pebblesoundWall.photos),
    ].map((image) => `img/${image.file}`);

    expect(configured.sort()).toEqual([...usedFiles].sort());
  });

  it('抠图的原始宽高和图片清单一致', () => {
    for (const cutout of Object.values(pebblesoundWall.cutouts)) {
      expect(assets.get(`img/${cutout.file}`), cutout.file).toMatchObject({
        width: cutout.width,
        height: cutout.height,
      });
    }
  });
});

describe('版本墙的无障碍说明：标「示例」，版本数用数出来的', () => {
  it('和设计稿第 2 屏的说明一字不差', () => {
    const designLabel = /<div role="img" aria-label="([^"]+)"/.exec(
      wallScreen,
    )?.[1];

    expect(designLabel).toMatch(/^示例：/);
    expect(generateWall(pebblesoundWall, designImage).label).toBe(designLabel);
  });

  it('版本数变了，说明里的数字跟着变', () => {
    const squaresOnly: WallConfig = {
      ...pebblesoundWall,
      shapes: [{ colSpan: 1, rowSpan: 1, weight: 1 }],
    };

    expect(generateWall(squaresOnly, designImage).label).toContain(
      ' 57 个版本',
    );
  });
});
