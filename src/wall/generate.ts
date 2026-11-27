// 版本墙生成器：变体配置进，一组定好位置的小图和它们的静态 HTML 出。
// 移植自设计交接包的 design/wall/generate_wall.py，产出以 design/wall/tiles.json 为准。
// 只在构建时运行（Astro 组件的 frontmatter 里），不联网，不调用任何 AI 接口。

import type {
  GridCell,
  Headline,
  TileShape,
  TileSize,
  WallConfig,
  WallGrid,
} from './config';
import type { DisplayBox } from '../media/responsive';
import { PythonRandom, pythonRound } from './python-compat';
import { drawTile, isTileSize, type Painter } from './templates';

export interface PlacedCell extends GridCell {
  colSpan: number;
  rowSpan: number;
}

/** 一张小图。字段和 tiles.json 里的一一对应；html 是小图内部的内容 */
export interface WallTile extends PlacedCell {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  background: string;
  color: string;
  size: TileSize;
  template: string;
  html: string;
}

export interface Wall {
  grid: WallGrid;
  /** 从生成结果里数出来的：版本数、语言数、尺寸数 */
  counts: { versions: number; languages: number; sizes: number };
  languages: string[];
  sizes: TileSize[];
  /** 整面墙的无障碍说明，带「示例」，版本数是数出来的 */
  label: string;
  tiles: WallTile[];
}

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

// 底色轮换的步长：序号乘它再加行号，相邻的小图就不会撞色
const PALETTE_STRIDE = 5;
const MARK_STYLE = 'font-size: 10px; letter-spacing: 0.1em';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** 设计稿里的写法：一个 <img>，地址由 url 给出 */
export function plainImage(url: (file: string) => string): WallImageRenderer {
  return ({ file, style }) =>
    `<img src="${escapeHtml(url(file))}" alt="" style="${style}">`;
}

/**
 * 用固定种子把格子切成大小不一的块，从左到右、从上到下。
 * 每到一个空格，把候选尺寸洗一次牌，取第一个放得下的。
 */
export function packGrid(config: WallConfig): PlacedCell[] {
  const { cols, rows, seed } = config.grid;
  const random = new PythonRandom(seed);
  const taken = Array.from({ length: rows }, () =>
    new Array<boolean>(cols).fill(false),
  );
  for (const { col, row } of config.reserved) taken[row][col] = true;

  const fits = (col: number, row: number, shape: TileShape): boolean => {
    if (col + shape.colSpan > cols || row + shape.rowSpan > rows) return false;
    for (let dc = 0; dc < shape.colSpan; dc += 1) {
      for (let dr = 0; dr < shape.rowSpan; dr += 1) {
        if (taken[row + dr][col + dc]) return false;
      }
    }
    return true;
  };

  const cells: PlacedCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (taken[row][col]) continue;
      const candidates = config.shapes.flatMap((shape) =>
        new Array<TileShape>(shape.weight).fill(shape),
      );
      random.shuffle(candidates);
      const shape = candidates.find((candidate) => fits(col, row, candidate));
      if (!shape) continue;
      for (let dc = 0; dc < shape.colSpan; dc += 1) {
        for (let dr = 0; dr < shape.rowSpan; dr += 1) {
          taken[row + dr][col + dc] = true;
        }
      }
      cells.push({ col, row, colSpan: shape.colSpan, rowSpan: shape.rowSpan });
    }
  }
  return cells;
}

function plainLength(headline: Headline): number {
  const text =
    'text' in headline
      ? headline.text
      : headline.words.join(headline.separator);
  return [...text].length;
}

function headlineHtml(headline: Headline): string {
  if ('text' in headline) return escapeHtml(headline.text);
  // 中日韩：每个词包成 inline-block，浏览器只能在词和词之间换行
  return headline.words
    .map(
      (word) =>
        `<span style="display: inline-block">${escapeHtml(word)}</span>`,
    )
    .join(escapeHtml(headline.separator));
}

function createPainter(
  config: WallConfig,
  renderImage: WallImageRenderer,
  usedLanguages: Set<string>,
  tile: { width: number; height: number },
): Painter {
  const text = (inner: string, css: string) =>
    `<span style="position: absolute; ${css}">${inner}</span>`;
  const cutoutHeight: Painter['cutoutHeight'] = (name, width) => {
    const cutout = config.cutouts[name];
    return pythonRound((width * cutout.height) / cutout.width);
  };

  return {
    config,
    text,
    cutoutHeight,
    cutout(name, left, top, width, rotate = 0) {
      const transform = rotate ? `; transform: rotate(${rotate}deg)` : '';
      return renderImage({
        file: config.cutouts[name].file,
        style: `position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${cutoutHeight(name, width)}px; max-width: none${transform}`,
        width,
      });
    },
    cover(name, position = '50% 50%') {
      // 铺满整张小图：按小图的框算图实际铺开多宽
      return renderImage({
        file: config.photos[name].file,
        style: `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: ${position}`,
        width: tile.width,
        height: tile.height,
      });
    },
    headline(index, maxLength = Infinity) {
      const { headlines } = config;
      let pick = index % headlines.length;
      for (
        let tried = 0;
        plainLength(headlines[pick]) > maxLength;
        tried += 1
      ) {
        if (tried === headlines.length) {
          throw new Error(`没有不超过 ${maxLength} 个字的标题`);
        }
        pick = (pick + 1) % headlines.length;
      }
      const headline = headlines[pick];
      usedLanguages.add(headline.lang);
      const dir = headline.dir ? ` dir="${headline.dir}"` : '';
      return `<span lang="${escapeHtml(headline.lang)}"${dir}>${headlineHtml(headline)}</span>`;
    },
    photoHeadline(name) {
      const headline = config.photos[name].headline;
      if (!headline) throw new Error(`场景图 ${name} 没有自带的标题`);
      usedLanguages.add(headline.lang);
      return `<span lang="${escapeHtml(headline.lang)}">${headline.lines.map(escapeHtml).join('<br>')}</span>`;
    },
    mark(position) {
      return text(escapeHtml(config.brandMark), `${position}; ${MARK_STYLE}`);
    },
  };
}

/**
 * 生成整面墙。同样的配置（含种子）每次得到同样的结果。
 * renderImage 把配置里的一张图画成页面上的 HTML。
 */
export function generateWall(
  config: WallConfig,
  renderImage: WallImageRenderer,
): Wall {
  const { grid, header, menuCell, palette } = config;
  const usedLanguages = new Set<string>();
  const turns = new Map<TileSize, number>();

  const tiles = packGrid(config).map((cell, index): WallTile => {
    const { col, row, colSpan, rowSpan } = cell;
    const left = col * grid.cellWidth + grid.gap / 2;
    const top = row * grid.cellHeight + grid.gap / 2;
    const width = colSpan * grid.cellWidth - grid.gap;
    const height = rowSpan * grid.cellHeight - grid.gap;

    const size = `${colSpan}x${rowSpan}`;
    if (!isTileSize(size)) throw new Error(`尺寸 ${size} 没有模板`);
    const turn = turns.get(size) ?? 0;
    turns.set(size, turn + 1);

    const rotation = config.templates[size];
    const onMenuCell =
      size === '1x1' && col === menuCell.col && row === menuCell.row;
    const template = onMenuCell
      ? menuCell.template
      : rotation[turn % rotation.length];
    const underHeader =
      row === header.row &&
      (left < header.logoEnd || left + width > header.navStart);

    const paint = createPainter(config, renderImage, usedLanguages, {
      width,
      height,
    });
    const draft = drawTile(
      size,
      template,
      { index, turn, underHeader, width, height },
      paint,
    );
    const { background, color } =
      draft.colors ?? palette[(index * PALETTE_STRIDE + row) % palette.length];

    return {
      index,
      col,
      row,
      colSpan,
      rowSpan,
      left,
      top,
      width,
      height,
      background,
      color,
      size,
      template,
      html: draft.html,
    };
  });

  const languages = [...usedLanguages].sort();
  const sizes = [...new Set(tiles.map((tile) => tile.size))].sort();
  return {
    grid: { ...grid },
    label: config.label.replace('{versions}', String(tiles.length)),
    counts: {
      versions: tiles.length,
      languages: languages.length,
      sizes: sizes.length,
    },
    languages,
    sizes,
    tiles,
  };
}

/** 把小图排成静态 HTML，一行一张。坐标是设计稿 1440x900 画布上的像素 */
export function renderWallTiles(wall: Wall): string {
  return wall.tiles
    .map(
      (tile) =>
        `<div style="position: absolute; left: ${tile.left}px; top: ${tile.top}px; width: ${tile.width}px; height: ${tile.height}px; overflow: hidden; background: ${tile.background}; color: ${tile.color}">${tile.html}</div>`,
    )
    .join('\n');
}
