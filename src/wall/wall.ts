// 版本墙：设计侧的定稿数据进，站点上的小图和它们的静态 HTML 出。
// 墙是设计侧手排的，版面、底色、标题都在 design/wall/tiles.json 里定好了；
// 这里不重新排，只换图片地址、数三个计数、输出 HTML。
// 只在构建时运行（Astro 组件的 frontmatter 里），不联网，不调用任何 AI 接口。

/** tiles.json 里的一张小图。坐标是设计稿 1440×900 画布上的像素，可以是负数 */
export interface DesignTile {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  /** 广告比例：1:1、4:5、9:16、1.91:1 */
  ratio: string;
  background: string;
  color: string;
  template: string;
  /** 标题的语言；没有标题的小图是 null */
  language: string | null;
  /** 中间最大的母版：第 2 屏的动画从它开始 */
  keyVisual: boolean;
  /** 第 3 屏被抽出来放大的那一张；灰墙里它的位置空着 */
  winner: boolean;
  /** 小图内部的内容。图片地址是设计稿里的相对路径 ../assets/img/… */
  html: string;
}

/** tiles.json 里这里用到的部分。它自带的 counts 不读：计数从 tiles 里数 */
export interface DesignWall {
  tiles: DesignTile[];
}

/** 站点上的一张小图：和设计稿的一样，只有 html 里的图片地址换成了站点自己的 */
export type WallTile = DesignTile;

export interface Wall {
  /** 从数据里数出来的：版本数、语言数、尺寸数 */
  counts: { versions: number; languages: number; sizes: number };
  languages: string[];
  sizes: string[];
  /** 整面墙的无障碍说明，带「示例」，版本数是数出来的 */
  label: string;
  tiles: WallTile[];
}

// 照抄 design/copy.md 第 2 屏的无障碍说明。{versions} 换成数出来的版本数
const LABEL =
  '示例：同一个降噪耳机广告创意的 {versions} 个版本。中间最大的一张是母版，其余的换了画面、底色、标题、语言和尺寸，铺到屏幕外面';

const DESIGN_IMAGE = /^\.\.\/assets\/img\/([^/]+)$/;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * 把设计侧的定稿数据变成站点上的那面墙。
 * imageUrl 把图片文件名换成页面上能用的地址；
 * 小图里出现交接包图片目录以外的地址就报错，不会原样输出一个打不开的地址。
 */
export function buildWall(
  design: DesignWall,
  imageUrl: (file: string) => string,
): Wall {
  const tiles = design.tiles.map((tile) => ({
    ...tile,
    html: tile.html.replace(/ src="([^"]*)"/g, (_, src: string) => {
      const file = DESIGN_IMAGE.exec(src)?.[1];
      if (!file) {
        throw new Error(
          `版本墙第 ${tile.index} 张小图里的地址不在交接包的图片目录里：${src}`,
        );
      }
      return ` src="${escapeHtml(imageUrl(file))}"`;
    }),
  }));

  const languages = sortedUnique(
    tiles.flatMap((tile) => (tile.language === null ? [] : [tile.language])),
  );
  const sizes = sortedUnique(tiles.map((tile) => tile.ratio));
  return {
    counts: {
      versions: tiles.length,
      languages: languages.length,
      sizes: sizes.length,
    },
    languages,
    sizes,
    label: LABEL.replace('{versions}', String(tiles.length)),
    tiles,
  };
}

/**
 * 把小图排成静态 HTML，一行一张。坐标是设计稿 1440×900 画布上的像素。
 * withoutWinner：第 3 屏的灰墙，不输出胜出的那一张，它的位置空着。
 */
export function renderWallTiles(
  wall: Wall,
  { withoutWinner = false }: { withoutWinner?: boolean } = {},
): string {
  return wall.tiles
    .filter((tile) => !(withoutWinner && tile.winner))
    .map(
      (tile) =>
        `<div style="position: absolute; left: ${tile.left}px; top: ${tile.top}px; width: ${tile.width}px; height: ${tile.height}px; overflow: hidden; background: ${tile.background}; color: ${tile.color}">${tile.html}</div>`,
    )
    .join('\n');
}
