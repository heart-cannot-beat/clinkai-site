import { describe, expect, it } from 'vitest';
import manifest from '../../design/assets/manifest.json';
import wallScreen from '../../design/screens/02-wall.html?raw';
import winnerScreen from '../../design/screens/03-winner.html?raw';
import designWall from '../../design/wall/tiles.json';
import { designScreenTiles } from './test-helpers';
import { buildWall, renderWallTiles, type DesignTile } from './wall';

// 基准是设计交接包里的定稿数据 design/wall/tiles.json 和每屏的 HTML 源。
// 设计侧重新导出后这里的测试会挂，按 docs/version-wall.md 同步。

// 设计稿里图片的相对路径。用它输出，结果应当和设计稿一字不差
const designImage = (file: string) => `../assets/img/${file}`;

/** 手写的一张小图，字段和 tiles.json 里的一样全 */
function tile(overrides: Partial<DesignTile>): DesignTile {
  return {
    index: 0,
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    ratio: '1:1',
    background: '#2743C9',
    color: '#F3EEE2',
    template: 'flat',
    language: null,
    keyVisual: false,
    winner: false,
    html: '',
    ...overrides,
  };
}

/** 手写的一面三张的小墙。counts 故意写错：计数必须是数出来的，不能照抄这里 */
const smallWall = {
  counts: { versions: 99, languages: 99, sizes: 99 },
  tiles: [
    tile({ index: 0, left: -10, language: 'en', ratio: '1:1' }),
    tile({ index: 1, left: 100, ratio: '9:16', winner: true }),
    tile({ index: 2, left: 200, language: 'ja', ratio: '1:1' }),
  ],
};

describe('版本墙：构建时直接读 design/wall/tiles.json', () => {
  const wall = buildWall(designWall, designImage);

  it('图片地址不换时，每一张都和 tiles.json 一样，顺序也一样', () => {
    expect(wall.tiles).toEqual(designWall.tiles);
  });

  it('一共 40 张', () => {
    expect(wall.tiles).toHaveLength(40);
  });

  it('图片路径换成站点自己的，其余不变', () => {
    const design = {
      tiles: [
        tile({
          html: '<img src="../assets/img/a.webp" alt="" style="width: 10px"><span lang="en">Mute</span><img src="../assets/img/b.jpg" alt="">',
        }),
      ],
    };

    const site = buildWall(design, (file) => `/_site/wall/${file}`);

    expect(site.tiles[0].html).toBe(
      '<img src="/_site/wall/a.webp" alt="" style="width: 10px"><span lang="en">Mute</span><img src="/_site/wall/b.jpg" alt="">',
    );
  });

  it('整面墙换完地址后，不剩设计稿里的相对路径', () => {
    const site = buildWall(designWall, (file) => `/_site/wall/${file}`);
    const html = renderWallTiles(site);

    expect(html).not.toContain('../assets/');
    expect(html.replaceAll('/_site/wall/', '../assets/img/')).toBe(
      renderWallTiles(wall),
    );
  });

  it('图片地址里的特殊字符会转义', () => {
    const design = {
      tiles: [tile({ html: '<img src="../assets/img/a.webp" alt="">' })],
    };

    const site = buildWall(design, () => '/a.webp?w=1&q="2"');

    expect(site.tiles[0].html).toBe(
      '<img src="/a.webp?w=1&amp;q=&quot;2&quot;" alt="">',
    );
  });

  it.each([
    'https://cdn.example/a.jpg',
    '../assets/video/creator-pebble.mp4',
    '../assets/img/nested/a.jpg',
    '',
  ])('小图里的地址不在交接包的图片目录里（%j）就报错，不会原样输出', (src) => {
    const design = {
      tiles: [tile({ index: 7, html: `<img src="${src}" alt="">` })],
    };

    expect(() => buildWall(design, designImage)).toThrow(/第 7 张/);
  });
});

describe('版本墙的三个计数：从数据里数，不手写', () => {
  const wall = buildWall(designWall, designImage);

  it('现在是 40 个版本、7 种语言、4 种尺寸，和设计侧数的一致', () => {
    expect(wall.counts).toEqual({ versions: 40, languages: 7, sizes: 4 });
    expect(wall.counts).toEqual(designWall.counts);
    expect(wall.languages).toEqual(['ar', 'de', 'en', 'es', 'fr', 'ja', 'ko']);
    expect(wall.sizes).toEqual(['1.91:1', '1:1', '4:5', '9:16']);
  });

  it('数据变了，计数跟着变：没有标题的小图不算语言，同样的比例只算一次', () => {
    const small = buildWall(smallWall, designImage);

    expect(small.counts).toEqual({ versions: 3, languages: 2, sizes: 2 });
    expect(small.languages).toEqual(['en', 'ja']);
    expect(small.sizes).toEqual(['1:1', '9:16']);
  });
});

describe('版本墙输出的静态 HTML', () => {
  const wall = buildWall(designWall, designImage);

  it('第 2 屏：和设计稿里的 40 张逐字一致', () => {
    const lines = renderWallTiles(wall).split('\n');

    expect(lines).toHaveLength(40);
    expect(lines).toEqual(designScreenTiles(wallScreen));
  });

  it('第 3 屏的灰墙：不输出胜出的那一张，其余 39 张逐字一致', () => {
    const lines = renderWallTiles(wall, { withoutWinner: true }).split('\n');

    expect(lines).toHaveLength(39);
    expect(lines).toEqual(designScreenTiles(winnerScreen));
  });

  it('被抽走的是右下那张钴蓝横幅，它的位置空着', () => {
    const banner =
      'left: 1162px; top: 545px; width: 316px; height: 165px; overflow: hidden; background: #2743C9';

    expect(renderWallTiles(wall)).toContain(banner);
    expect(renderWallTiles(wall, { withoutWinner: true })).not.toContain(
      banner,
    );
  });

  it('抽走哪一张看数据里的 winner，不看序号；其余的位置不动', () => {
    const small = buildWall(smallWall, designImage);

    expect(renderWallTiles(small, { withoutWinner: true })).toBe(
      [
        '<div style="position: absolute; left: -10px; top: 0px; width: 100px; height: 100px; overflow: hidden; background: #2743C9; color: #F3EEE2"></div>',
        '<div style="position: absolute; left: 200px; top: 0px; width: 100px; height: 100px; overflow: hidden; background: #2743C9; color: #F3EEE2"></div>',
      ].join('\n'),
    );
  });

  it('设计稿里只有一张母版、一张胜出', () => {
    expect(wall.tiles.filter((tile) => tile.keyVisual)).toHaveLength(1);
    expect(wall.tiles.filter((tile) => tile.winner)).toHaveLength(1);
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

  it('阿拉伯语标题保留从右到左的方向', () => {
    expect(renderWallTiles(wall)).toContain(
      '<span lang="ar" dir="rtl">اكتم ضجيج المدينة.</span>',
    );
  });
});

describe('广告屏的墙里没有达人素材（CLAUDE.md 规则 4）', () => {
  const wall = buildWall(designWall, designImage);
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
});

describe('版本墙的无障碍说明：标「示例」，版本数用数出来的', () => {
  it('和设计稿第 2 屏的说明一字不差', () => {
    const designLabel = /<div role="img" aria-label="([^"]+)"/.exec(
      wallScreen,
    )?.[1];

    expect(designLabel).toMatch(/^示例：/);
    expect(buildWall(designWall, designImage).label).toBe(designLabel);
  });

  it('版本数变了，说明里的数字跟着变', () => {
    expect(buildWall(smallWall, designImage).label).toContain(' 3 个版本');
  });
});
