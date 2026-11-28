// 03 屏第 2 拍右边的 8 个新版本。版面、底色、标题、用哪张图都照 design/screens/03b-next-round.html；
// 只在构建时运行，输出静态 HTML。图片怎么画和版本墙是同一套（src/wall/wall.ts 的 WallImageRenderer）：
// 站点上画成走图片管线的 <picture>，测试里画成设计稿的 <img>，和设计稿逐行对照。
// 全部是虚构品牌 Pebblesound 的示例广告，只用广告图和产品图。

import type { WallImage, WallImageRenderer } from '../wall/wall';

/** 铺满整张小图的场景图 */
interface CoverImage {
  kind: 'cover';
  file: string;
  /** object-position，如 50% 50% */
  position: string;
}

/** 摆在小图里的产品抠图。坐标是小图内部的像素 */
interface CutoutImage {
  kind: 'cutout';
  file: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** 旋转的角度 */
  rotate?: number;
}

export interface NextRoundTile {
  /** 设计稿 1440×900 画布上的位置 */
  left: number;
  top: number;
  background: string;
  color: string;
  image: CoverImage | CutoutImage;
  /** 标题的语言 */
  language: string;
  /** 标题的两行 */
  title: readonly [string, string];
}

/** 每张小图的大小 */
const WIDTH = 172;
const HEIGHT = 250;

export const NEXT_ROUND_TILES: readonly NextRoundTile[] = [
  {
    left: 640,
    top: 176,
    background: '#B9BEC2',
    color: '#1C1C1B',
    image: { kind: 'cover', file: 'pebble_subway.jpg', position: '50% 50%' },
    language: 'en',
    title: ['Mute the', 'commute.'],
  },
  {
    left: 836,
    top: 176,
    background: '#B9C8EC',
    color: '#1C1C1B',
    image: {
      kind: 'cutout',
      file: 'pebble_cut_open.webp',
      left: 26,
      top: 112,
      width: 120,
      height: 118,
    },
    language: 'en',
    title: ['Mute the', 'open office.'],
  },
  {
    left: 1032,
    top: 176,
    background: '#16205A',
    color: '#F3EEE2',
    image: {
      kind: 'cutout',
      file: 'pebble_cut_single.webp',
      left: 30,
      top: 116,
      width: 112,
      height: 113,
      rotate: -12,
    },
    language: 'en',
    title: ['Mute the', 'flight.'],
  },
  {
    left: 1228,
    top: 176,
    background: '#CBC7BE',
    color: '#1C1C1B',
    image: {
      kind: 'cutout',
      file: 'pebble_cut_closed.webp',
      left: 20,
      top: 126,
      width: 132,
      height: 105,
    },
    language: 'en',
    title: ['Mute the', 'neighbours.'],
  },
  {
    left: 640,
    top: 450,
    background: '#2743C9',
    color: '#F3EEE2',
    image: {
      kind: 'cutout',
      file: 'pebble_cut_hand.webp',
      left: 6,
      top: 84,
      width: 160,
      height: 255,
    },
    language: 'ja',
    title: ['街を、', 'ミュート。'],
  },
  {
    left: 836,
    top: 450,
    background: '#2A2A28',
    color: '#F3EEE2',
    image: {
      kind: 'cutout',
      file: 'pebble_cut_pair.webp',
      left: 10,
      top: 138,
      width: 152,
      height: 69,
    },
    language: 'en',
    title: ['Mute the', 'gym.'],
  },
  {
    left: 1032,
    top: 450,
    background: '#1F3BB3',
    color: '#F3EEE2',
    image: { kind: 'cover', file: 'pebble_photo_ear.jpg', position: '45% 50%' },
    language: 'en',
    title: ['Mute', 'Monday.'],
  },
  {
    left: 1228,
    top: 450,
    background: '#C9C1B4',
    color: '#1C1C1B',
    image: {
      kind: 'cover',
      file: 'pebble_photo_table.jpg',
      position: '40% 60%',
    },
    language: 'en',
    title: ['Mute the', 'café.'],
  },
];

function imageStyle(image: CoverImage | CutoutImage): string {
  if (image.kind === 'cover') {
    return `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: ${image.position}`;
  }
  const rotate =
    image.rotate === undefined ? '' : `; transform: rotate(${image.rotate}deg)`;
  return `position: absolute; left: ${image.left}px; top: ${image.top}px; width: ${image.width}px; height: ${image.height}px; max-width: none${rotate}`;
}

/** 小图里的那张图：文件名、内联样式、在 1440 宽画布上显示多大 */
function wallImage({ image }: NextRoundTile): WallImage {
  const style = imageStyle(image);
  // 铺满小图的场景图按小图的框算（cover），产品抠图按它自己的宽度
  return image.kind === 'cover'
    ? { file: image.file, style, width: WIDTH, height: HEIGHT }
    : { file: image.file, style, width: image.width };
}

/** 小图里用到的图片文件名，去重、排好序 */
export function nextRoundImageFiles(tiles: readonly NextRoundTile[]): string[] {
  return [...new Set(tiles.map((tile) => tile.image.file))].sort();
}

/**
 * 把小图排成静态 HTML，一行一张，写法和设计稿一样。
 * renderImage 把小图里的那张图画成页面上的 HTML。
 */
export function renderNextRoundTiles(
  tiles: readonly NextRoundTile[],
  renderImage: WallImageRenderer,
): string {
  return tiles
    .map(
      (tile) =>
        `<div style="position: absolute; left: ${tile.left}px; top: ${tile.top}px; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: ${tile.background}; color: ${tile.color}">` +
        renderImage(wallImage(tile)) +
        `<span style="position: absolute; left: 12px; right: 12px; top: 14px; font-size: 24px; line-height: 1.04; letter-spacing: -0.01em">` +
        `<span lang="${tile.language}">${tile.title[0]}<br>${tile.title[1]}</span></span></div>`,
    )
    .join('\n');
}
