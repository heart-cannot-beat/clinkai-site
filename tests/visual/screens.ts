// 截图对比比哪些屏、差多少算失败。说明和定这些数的依据见 docs/visual-compare.md。

/** 要比的一屏 */
export interface Screen {
  /** design/screens/ 里的文件名（不带 .html） */
  name: string;
  /** 站点上的地址 */
  path: string;
  /** 这一屏在站点页面上的选择器 */
  selector: string;
  /** 带图片比时，差异像素占整屏的比例上限 */
  maxRatioWithImages: number;
}

/** 设计稿每个文件里的那一帧：<body> 下唯一的那个 1440×900 的块 */
export const DESIGN_FRAME = 'body > div';

/** 截图的视口，就是设计稿的画布大小 */
export const VIEWPORT = { width: 1440, height: 900 };

/**
 * 第一遍：藏起图片，只比版式、文字和色块。
 * 两边是同一个浏览器、同一套字体画的，实测一个像素都不差（差值全是 0）。
 * 一个像素的差值是红绿蓝三个通道里差得最多的那个（0–255）；超过 tolerance 的像素多于 maxPixels 个就失败。
 * 留的这点余量只为挡住浏览器抗锯齿偶尔的抖动，比页面上最小的东西（8px 的圆点约 50 个像素）还小。
 */
export const LAYOUT = {
  tolerance: 2,
  maxPixels: 16,
};

/**
 * 第二遍：带图片比整屏。站点的图片经过图片管线转成了 AVIF、按显示大小缩过，
 * 和设计稿直接用的原图比，图里明暗交界的地方有压缩噪点。所以容差放宽，上限按屏定。
 */
export const WITH_IMAGES = {
  tolerance: 24,
};

const percent = (value: number): number => value / 100;

const home = (name: string, maxPercentWithImages: number): Screen => ({
  name,
  path: '/',
  selector: `[data-screen="${name}"]`,
  maxRatioWithImages: percent(maxPercentWithImages),
});

/**
 * 首页 6 屏，第 3 屏有两拍（03-winner、03b-next-round）。
 * 第二个数是带图片比的上限（百分数），大约是实测值的 1.7 倍；没有图片的屏和第一遍一样紧。
 * 子页面（page-products、page-about、page-contact）等 P-03 合并后加在这里。
 */
export const SCREENS: Screen[] = [
  home('01-hero', 0.02), // 实测 0
  home('02-wall', 0.35), // 实测 0.209%
  home('03-winner', 0.25), // 实测 0.133%
  home('03b-next-round', 0.15), // 实测 0.069%
  home('04-creators', 0.03), // 实测 0.008%
  home('05-layers', 0.002), // 没有图片，实测 0
  home('06-ending', 0.002), // 没有图片，实测 0
];
