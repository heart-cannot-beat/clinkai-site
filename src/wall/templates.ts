// 版本墙每种尺寸的模板：小图里图片和文字摆在哪。
// 位置、字号都照 design/wall/generate_wall.py 移植（脚本里的 k11、k12、k21、k22 四组），
// 模板名也沿用脚本里的，方便和 tiles.json 的 template 字段对照。

import type {
  CutoutName,
  PhotoName,
  TileColors,
  TileSize,
  WallConfig,
} from './config';
import { pythonRound } from './python-compat';

/** 正在画的这一张小图 */
export interface TileContext {
  /** 在整面墙里的序号，决定轮到哪一句标题 */
  index: number;
  /** 同一种尺寸里的第几张，从 0 数 */
  turn: number;
  /** 压在页头胶囊下面：文字要放到底部 */
  underHeader: boolean;
  width: number;
  height: number;
}

export interface TileDraft {
  html: string;
  /** 不写就用轮换的底色和字色 */
  colors?: TileColors;
}

/** 画一张小图要用到的零件。标题用过哪些语言由它记着 */
export interface Painter {
  config: WallConfig;
  /** 抠好底的产品图，按宽度等比缩放；rotate 是角度 */
  cutout(
    name: CutoutName,
    left: number,
    top: number,
    width: number,
    rotate?: number,
  ): string;
  cutoutHeight(name: CutoutName, width: number): number;
  /** 铺满整张小图的广告场景图 */
  cover(name: PhotoName, position?: string): string;
  /** 轮换的标题；maxLength 限制字数，太长的顺延到下一句 */
  headline(index: number, maxLength?: number): string;
  /** 场景图自带的标题 */
  photoHeadline(name: PhotoName): string;
  /** 品牌字标 */
  mark(position: string): string;
  text(inner: string, css: string): string;
}

type Template = (tile: TileContext, paint: Painter) => TileDraft;

const SMALL = 'font-size: 15px; line-height: 1.12';
const TALL = 'font-size: 19px; line-height: 1.1';

/** 压在页头下面时文字贴底，否则贴顶 */
function away(tile: TileContext, inset: number): string {
  return tile.underHeader ? `bottom: ${inset}px` : `top: ${inset}px`;
}

// 1x1：一个产品居中，标题在上或在下。同一种尺寸里隔一张换一次上下
function product(
  name: 'open' | 'closed' | 'top' | 'single',
  width: number,
): Template {
  return (tile, paint) => {
    const height = paint.cutoutHeight(name, width);
    const odd = tile.turn % 2 === 1;
    const textAtBottom = tile.underHeader || odd;
    const rotate = name === 'single' ? (odd ? -14 : 10) : 0;
    return {
      html:
        paint.cutout(
          name,
          pythonRound((tile.width - width) / 2),
          textAtBottom ? 8 : tile.height - height - 10,
          width,
          rotate,
        ) +
        paint.text(
          paint.headline(tile.index),
          `left: 10px; right: 10px; ${textAtBottom ? 'bottom: 10px' : 'top: 10px'}; ${SMALL}`,
        ),
    };
  };
}

// 1x1：场景图铺满，标题压在图上
function smallPhoto(name: PhotoName, position: string): Template {
  return (tile, paint) => ({
    colors: paint.config.photos[name],
    html:
      paint.cover(name, position) +
      paint.text(
        paint.headline(tile.index),
        `left: 10px; right: 10px; ${away(tile, 10)}; ${SMALL}`,
      ),
  });
}

// 2x1：产品在右，标题在左
function banner(
  name: 'open' | 'closed',
  left: number,
  top: number,
  width: number,
  textWidth: number,
): Template {
  return (tile, paint) => ({
    html:
      paint.cutout(name, left, top, width) +
      paint.text(
        paint.headline(tile.index),
        `left: 14px; width: ${textWidth}px; ${away(tile, 14)}; font-size: 21px; line-height: 1.08`,
      ),
  });
}

const TEMPLATES = {
  '1x1': {
    open: product('open', 92),
    closed: product('closed', 104),
    top: product('top', 104),
    single: product('single', 84),
    pair: (tile, paint) => ({
      html:
        paint.cutout('pair', 8, tile.underHeader ? 20 : 74, 124) +
        paint.text(
          paint.headline(tile.index),
          `left: 10px; right: 10px; ${away(tile, 10)}; ${SMALL}`,
        ),
    }),
    // 纯文字
    type: (tile, paint) => ({
      html:
        paint.mark('left: 10px; top: 10px') +
        paint.text(
          paint.headline(tile.index),
          'left: 10px; right: 10px; bottom: 10px; font-size: 23px; line-height: 1.05; letter-spacing: -0.01em',
        ),
    }),
    // 产品特写，不带标题
    cropS: (_tile, paint) => ({
      html: paint.cutout('single', -46, 4, 250, -8),
    }),
    cropC: (_tile, paint) => ({
      html:
        paint.cutout('closed', -96, 34, 310) +
        paint.mark('left: 10px; top: 10px'),
    }),
    table: smallPhoto('table', '40% 62%'),
    ear: smallPhoto('ear', '42% 22%'),
  },
  '1x2': {
    hand: (tile, paint) => ({
      html:
        paint.cutout('hand', -5, tile.underHeader ? 40 : 70, 150) +
        paint.text(
          paint.headline(tile.index, 20),
          `left: 12px; right: 12px; ${away(tile, 14)}; ${TALL}`,
        ),
    }),
    stack: (tile, paint) => ({
      html:
        paint.cutout('open', 14, tile.underHeader ? 40 : 96, 112) +
        paint.cutout('pair', 10, tile.underHeader ? 160 : 222, 120) +
        paint.text(
          paint.headline(tile.index, 20),
          `left: 12px; right: 12px; ${away(tile, 14)}; ${TALL}`,
        ),
    }),
    ear: (tile, paint) => ({
      colors: paint.config.photos.ear,
      html:
        paint.cover('ear', '45% 50%') +
        paint.text(
          paint.headline(tile.index),
          `left: 12px; right: 12px; ${tile.underHeader ? 'top: 70px' : 'top: 14px'}; ${TALL}`,
        ),
    }),
    subway: (tile, paint) => ({
      colors: paint.config.photos.subway,
      html:
        paint.cover('subway') +
        paint.text(
          paint.photoHeadline('subway'),
          `left: 8px; right: 8px; ${tile.underHeader ? 'top: 70px' : 'top: 16px'}; font-size: 19px; line-height: 1.05; text-align: center`,
        ),
    }),
  },
  '2x1': {
    bopen: banner('open', 160, 20, 110, 132),
    bclosed: banner('closed', 148, 24, 124, 124),
    pairR: (tile, paint) => ({
      html:
        paint.cutout('pair', 10, 40, 150) +
        paint.text(
          paint.headline(tile.index),
          'right: 14px; width: 104px; text-align: right; bottom: 14px; font-size: 19px; line-height: 1.08',
        ),
    }),
    hero: (tile, paint) => ({
      html:
        paint.cutout('hero', 110, tile.underHeader ? 22 : 34, 170) +
        paint.text(
          paint.headline(tile.index),
          `left: 14px; width: 92px; ${away(tile, 14)}; font-size: 19px; line-height: 1.08`,
        ),
    }),
    // 纯文字
    typeb: (tile, paint) => ({
      html:
        paint.mark(`right: 14px; ${away(tile, 12)}`) +
        paint.text(
          paint.headline(tile.index),
          `left: 14px; right: 14px; ${tile.underHeader ? 'top: 70px' : 'bottom: 14px'}; font-size: 31px; line-height: 1.04; letter-spacing: -0.015em`,
        ),
    }),
    trumpet: (tile, paint) => ({
      colors: paint.config.photos.trumpet,
      html:
        paint.cover('trumpet', '50% 56%') +
        paint.text(
          paint.photoHeadline('trumpet'),
          `left: 14px; ${away(tile, 14)}; font-size: 21px; line-height: 1.02`,
        ),
    }),
  },
  '2x2': {
    trumpet: (_tile, paint) => ({
      colors: paint.config.photos.trumpet,
      html:
        paint.cover('trumpet', '72% 50%') +
        paint.text(
          paint.photoHeadline('trumpet'),
          'left: 16px; top: 16px; font-size: 36px; line-height: 0.98; letter-spacing: -0.02em',
        ) +
        paint.mark('left: 16px; bottom: 16px'),
    }),
    // 主视觉：第 3 屏被抽出来放大的那一张
    hero: (tile, paint) => ({
      colors: paint.config.hero,
      html:
        paint.cutout('hero', 12, 118, 262) +
        paint.text(
          paint.headline(tile.index),
          'left: 16px; right: 16px; top: 16px; font-size: 34px; line-height: 1.02; letter-spacing: -0.02em',
        ) +
        paint.mark('left: 16px; bottom: 16px'),
    }),
  },
} satisfies Record<TileSize, Record<string, Template>>;

export type TemplateName<Size extends TileSize = TileSize> = Size extends Size
  ? keyof (typeof TEMPLATES)[Size]
  : never;

/** 这种尺寸有没有模板。格子能切出的尺寸由配置决定，所以要在生成时查一下 */
export function isTileSize(size: string): size is TileSize {
  return Object.hasOwn(TEMPLATES, size);
}

export function drawTile<Size extends TileSize>(
  size: Size,
  template: TemplateName<Size>,
  tile: TileContext,
  paint: Painter,
): TileDraft {
  const templates: Record<string, Template> = TEMPLATES[size];
  return templates[template as string](tile, paint);
}
