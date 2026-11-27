// 版本墙的变体配置：格子、尺寸、底色、标题、图片和每种尺寸轮流套的模板。
// 数值全部来自设计交接包的 design/wall/generate_wall.py；要改先改交接包，再同步到这里。
// 品牌 Pebblesound 是虚构的，图片是 design/assets/manifest.json 里的示例素材。

import type { TemplateName } from './templates';

export type TileSize = '1x1' | '1x2' | '2x1' | '2x2';

export interface TileColors {
  background: string;
  color: string;
}

export interface WallGrid {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  /** 格与格之间露出深色底的缝，px */
  gap: number;
  /** 切格子用的随机种子。固定住，同样的配置才会得到同样的墙 */
  seed: number;
}

export interface GridCell {
  col: number;
  row: number;
}

/** 切格子时的一种候选尺寸；weight 越大，抽到的机会越多 */
export interface TileShape {
  colSpan: number;
  rowSpan: number;
  weight: number;
}

/** 轮换的广告标题。中日韩的标题拆成词，只在词和词之间换行 */
export type Headline = { lang: string; dir?: 'rtl' } & (
  { text: string } | { words: string[]; separator: string }
);

/** 抠好底的产品图。原图的宽高用来算等比缩放后的高度 */
export interface Cutout {
  file: string;
  width: number;
  height: number;
}

/** 铺满整张小图的广告场景图。底色和字色跟着图走，不参加轮换 */
export interface Photo extends TileColors {
  file: string;
  /** 这张图自带的标题；没有的用轮换标题 */
  headline?: { lang: string; lines: string[] };
}

export type CutoutName =
  'open' | 'closed' | 'top' | 'pair' | 'single' | 'hero' | 'hand';

export type PhotoName = 'ear' | 'table' | 'trumpet' | 'subway';

export interface WallConfig {
  /** 整面墙的无障碍说明。{versions} 会换成实际生成的版本数 */
  label: string;
  grid: WallGrid;
  /** 不放小图的格子：左下角留给计数块 */
  reserved: GridCell[];
  shapes: TileShape[];
  /** 页头胶囊压住的范围：第 0 行里左边缘小于 logoEnd、或右边缘大于 navStart 的小图，文字放到底部 */
  header: { row: number; logoEnd: number; navStart: number };
  /** 右下角被菜单按钮盖住的那一格：1x1 的小图在这里固定用不带标题的模板 */
  menuCell: GridCell & { template: TemplateName<'1x1'> };
  brandMark: string;
  /** 轮换的底色和字色 */
  palette: TileColors[];
  /** 2x2 主视觉固定的底色和字色：第 3 屏被抽出来放大的就是这一张 */
  hero: TileColors;
  headlines: Headline[];
  cutouts: Record<CutoutName, Cutout>;
  photos: Record<PhotoName, Photo>;
  /** 每种尺寸轮流套的模板，按出现顺序循环 */
  templates: { [Size in TileSize]: TemplateName<Size>[] };
}

/** 配置里登记的全部图片文件名（产品图和场景图） */
export function wallImageFiles(config: WallConfig): string[] {
  return [
    ...Object.values(config.cutouts),
    ...Object.values(config.photos),
  ].map((image) => image.file);
}

const INK = '#1C1C1B';
const COBALT = '#2743C9';
const CREAM = '#F3EEE2';
const STONE = '#CBC7BE';
const PALE = '#B9C8EC';
const BRASS = '#CDA349';
const NAVY = '#16205A';
const DARK = '#2A2A28';

/** 首页第 2 屏的版本墙（第 3 屏背后的灰墙用同一份）：虚构品牌 Pebblesound 的一个创意。示例 */
export const pebblesoundWall: WallConfig = {
  label:
    '示例：同一个降噪耳机广告创意的 {versions} 个版本，换了画面、底色、标题、语言和尺寸，铺满整屏',
  grid: {
    cols: 10,
    rows: 6,
    cellWidth: 144,
    cellHeight: 150,
    gap: 4,
    seed: 170,
  },
  reserved: [
    { col: 0, row: 5 },
    { col: 1, row: 5 },
    { col: 2, row: 5 },
  ],
  shapes: [
    { colSpan: 1, rowSpan: 1, weight: 9 },
    { colSpan: 1, rowSpan: 2, weight: 4 },
    { colSpan: 2, rowSpan: 1, weight: 4 },
    { colSpan: 2, rowSpan: 2, weight: 2 },
  ],
  header: { row: 0, logoEnd: 200, navStart: 880 },
  menuCell: { col: 9, row: 5, template: 'cropC' },
  brandMark: 'PEBBLESOUND',
  palette: [
    { background: COBALT, color: CREAM },
    { background: STONE, color: INK },
    { background: DARK, color: CREAM },
    { background: PALE, color: INK },
    { background: BRASS, color: INK },
    { background: NAVY, color: CREAM },
  ],
  hero: { background: COBALT, color: CREAM },
  headlines: [
    { lang: 'en', text: 'Mute the city.' },
    { lang: 'ja', words: ['街を、', 'ミュート。'], separator: '' },
    { lang: 'en', text: 'Rush hour, on silent.' },
    { lang: 'de', text: 'Stadt auf stumm.' },
    { lang: 'fr', text: 'Coupe le son de la ville.' },
    { lang: 'en', text: 'Commute, minus the noise.' },
    { lang: 'es', text: 'Silencia la ciudad.' },
    { lang: 'ko', words: ['도시를', '음소거.'], separator: ' ' },
    { lang: 'ar', dir: 'rtl', text: 'اكتم ضجيج المدينة.' },
    { lang: 'en', text: 'Quiet fits in a pocket.' },
  ],
  cutouts: {
    open: { file: 'pebble_cut_open.webp', width: 640, height: 629 },
    closed: { file: 'pebble_cut_closed.webp', width: 640, height: 510 },
    top: { file: 'pebble_cut_top.webp', width: 640, height: 495 },
    pair: { file: 'pebble_cut_pair.webp', width: 760, height: 345 },
    single: { file: 'pebble_cut_single.webp', width: 640, height: 643 },
    hero: { file: 'pebble_cut_hero.webp', width: 1336, height: 808 },
    hand: { file: 'pebble_cut_hand.webp', width: 620, height: 990 },
  },
  photos: {
    ear: { file: 'pebble_photo_ear.jpg', background: '#1F3BB3', color: CREAM },
    table: {
      file: 'pebble_photo_table.jpg',
      background: '#C9C1B4',
      color: INK,
    },
    trumpet: {
      file: 'pebble_trumpet.jpg',
      background: '#1B35B0',
      color: CREAM,
      headline: { lang: 'en', lines: ['Mute', 'the city.'] },
    },
    subway: {
      file: 'pebble_subway.jpg',
      background: '#B9BEC2',
      color: INK,
      headline: { lang: 'en', lines: ['Rush hour,', 'on silent.'] },
    },
  },
  templates: {
    '1x1': [
      'open',
      'type',
      'cropS',
      'closed',
      'table',
      'pair',
      'type',
      'single',
      'cropC',
      'top',
      'ear',
      'open',
      'type',
      'single',
      'closed',
    ],
    '1x2': ['hand', 'stack', 'ear', 'subway'],
    '2x1': ['bopen', 'typeb', 'trumpet', 'pairR', 'hero', 'typeb', 'bclosed'],
    '2x2': ['trumpet', 'hero'],
  },
};
