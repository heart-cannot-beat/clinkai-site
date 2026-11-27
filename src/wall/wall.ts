// 版本墙：设计侧的定稿数据进，站点上的小图和它们的静态 HTML 出。
// 墙是设计侧手排的，版面、底色、标题都在 design/wall/tiles.json 里定好了；
// 这里不重新排，只把图片换成站点自己的画法、数三个计数、输出 HTML。
// 只在构建时运行（Astro 组件的 frontmatter 里），不联网，不调用任何 AI 接口。

import type { DisplayBox } from '../media/responsive';

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

/** 站点上的一张小图：和设计稿的一样，只有 html 里的图片换成了站点自己的画法 */
export type WallTile = DesignTile;

/** 墙里的一张图：文件名、设计稿里这张图的内联样式、在 1440 宽画布上显示多大 */
export interface WallImage extends DisplayBox {
  file: string;
  style: string;
}

/**
 * 把墙里的一张图画成 HTML。站点上输出带 AVIF、WebP 和多尺寸的 <picture>
 * （src/wall/index.ts），和设计稿对照时输出设计稿里的 <img>（plainImage）。
 */
export type WallImageRenderer = (image: WallImage) => string;

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

// 设计稿里图片只有这一种写法：地址、空的 alt、内联样式
const DESIGN_IMG = /<img src="([^"]*)" alt="" style="([^"]*)">/g;
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

/** 设计稿里的写法：一个 <img>，地址由 url 给出 */
export function plainImage(url: (file: string) => string): WallImageRenderer {
  return ({ file, style }) =>
    `<img src="${escapeHtml(url(file))}" alt="" style="${style}">`;
}

/**
 * 图在画布上显示多大，从设计稿的内联样式里读：
 * 铺满整张小图的场景图（object-fit: cover）按小图的框算；
 * 按像素摆放的产品图用样式里写的宽度。
 */
function displayBox(tile: DesignTile, style: string): DisplayBox {
  if (/(^|; )object-fit: cover(;|$)/.test(style)) {
    return { width: tile.width, height: tile.height };
  }
  const width = /(?:^|; )width: (\d+)px(?:;|$)/.exec(style)?.[1];
  if (!width) {
    throw new Error(
      `版本墙第 ${tile.index} 张小图里有一张图，从样式里看不出显示多大：${style}`,
    );
  }
  return { width: Number(width) };
}

/**
 * 把一张小图里的图片逐张交给 draw，用它返回的 HTML 换掉原来的 <img>。
 * 认不出的图片写法、交接包图片目录以外的地址都报错：
 * 不会漏掉哪张图不处理，也不会原样输出一个打不开的地址。
 */
function replaceImages(tile: DesignTile, draw: WallImageRenderer): string {
  let found = 0;
  const html = tile.html.replace(
    DESIGN_IMG,
    (_, src: string, style: string) => {
      found += 1;
      const file = DESIGN_IMAGE.exec(src)?.[1];
      if (!file) {
        throw new Error(
          `版本墙第 ${tile.index} 张小图里的地址不在交接包的图片目录里：${src}`,
        );
      }
      return draw({ file, style, ...displayBox(tile, style) });
    },
  );
  const expected = Math.max(
    tile.html.match(/<img\b/g)?.length ?? 0,
    tile.html.match(/ src=/g)?.length ?? 0,
  );
  if (found !== expected) {
    throw new Error(
      `版本墙第 ${tile.index} 张小图里有认不出的图片写法：${tile.html}`,
    );
  }
  return html;
}

/** 墙里用到的图片文件名，去重、排好序 */
export function wallImageFiles(design: DesignWall): string[] {
  const files: string[] = [];
  for (const tile of design.tiles) {
    replaceImages(tile, ({ file }) => {
      files.push(file);
      return '';
    });
  }
  return sortedUnique(files);
}

/**
 * 把设计侧的定稿数据变成站点上的那面墙。
 * renderImage 把小图里的每张图画成页面上的 HTML。
 */
export function buildWall(
  design: DesignWall,
  renderImage: WallImageRenderer,
): Wall {
  const tiles = design.tiles.map((tile) => ({
    ...tile,
    html: replaceImages(tile, renderImage),
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
