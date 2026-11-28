// 截图对比比哪些屏、差多少算失败。说明和定这些数的依据见 docs/visual-compare.md。

/** 设计稿里的一块，站点和它有意不一样 */
export interface Exception {
  /** 这一块在设计稿文件里的选择器 */
  selector: string;
  /** 站点为什么和设计稿不一样 */
  reason: string;
}

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
  /**
   * 渲染基准图时藏起来的东西（位置还占着）：设计稿里【待填】的占位框。
   * 站点在真实信息补齐之前整块不显示，藏起来以后比的就是「站点那里确实是空的」。
   * 信息补齐、站点开始显示那一块时，对比会失败：那时把这一项删掉。
   */
  hiddenInDesign?: Exception[];
  /**
   * 不比的区域：设计稿里这几块东西占的长方形，两遍都跳过。
   * 只用在【待填】让站点的排法和设计稿不一样、藏起来也对不上的地方。能用 hiddenInDesign 就不用这个：
   * 这里面站点画成什么样都不会失败。
   */
  skippedAreas?: Exception[];
  /**
   * 第一遍（藏起图片）的像素上限，不写就用 LAYOUT.maxPixels。
   * 只在站点和设计稿有一处已知的、已经报给对应工单的小差别时放宽，旁边写明差在哪。
   */
  maxLayoutPixels?: number;
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

/**
 * 用 src/home/Screen.astro 画的一屏：站点上带 data-screen，值就是设计稿的文件名。
 * maxPercentWithImages 是带图片比的上限（百分数）。
 */
const canvas = (
  name: string,
  path: string,
  maxPercentWithImages: number,
  hiddenInDesign?: Exception[],
): Screen => ({
  name,
  path,
  selector: `[data-screen="${name}"]`,
  maxRatioWithImages: percent(maxPercentWithImages),
  hiddenInDesign,
});

/**
 * 带图片比的上限大约是实测值的 1.7 倍；没有图片的屏和第一遍一样紧。
 */
export const SCREENS: Screen[] = [
  // 首页 6 屏，第 3 屏有两拍（03-winner、03b-next-round）
  canvas('01-hero', '/', 0.02), // 实测 0
  canvas('02-wall', '/', 0.35), // 实测 0.209%
  canvas('03-winner', '/', 0.25), // 实测 0.133%
  canvas('03b-next-round', '/', 0.15), // 实测 0.069%
  canvas('04-creators', '/', 0.03), // 实测 0.008%
  canvas('05-layers', '/', 0.002), // 没有图片，实测 0
  canvas('06-ending', '/', 0.002), // 没有图片，实测 0

  // 我们的产品：一页三屏
  canvas('page-products', '/products/', 0.002), // 没有图片，实测 0
  canvas('page-products-ads', '/products/', 0.06), // 实测 0.033%
  canvas('page-products-creators', '/products/', 0.01), // 实测 0.002%

  // 关于我们
  // 没有图片，实测 0
  canvas('page-about', '/about/', 0.002, [
    {
      selector: 'dl',
      reason:
        '底部四项事实（成立、团队、办公地、投放平台）都是【待填】，补齐之前站点整块不显示（src/data/about.ts）',
    },
  ]),

  // 预约沟通。这一页不是用 Screen.astro 画的，视口 1440×900 时整页就是设计稿的那一帧
  {
    name: 'page-contact',
    path: '/contact/',
    selector: '.contact-page',
    maxRatioWithImages: percent(0.002), // 没有图片，实测 0
    hiddenInDesign: [
      {
        selector: 'dl',
        reason:
          '左下角的邮箱、微信都是【待填】，补齐之前站点不显示（src/data/contact.ts）',
      },
    ],
    skippedAreas: [
      {
        selector: 'form > div',
        reason:
          '「月预算」和「怎么联系你」并排的那一行：预算分档是【待填】，补齐之前站点不显示月预算，「怎么联系你」占满整行',
      },
    ],
    // 标题后面的句号：站点上是 109.984px 见方（用 em 算出来的，被浏览器截到 1/64px），设计稿是 110px，
    // 圆的边上因此差 26 个像素（最大差值 11）。已在 PR 里报给 P-04，修好以后删掉这一行
    maxLayoutPixels: 40,
  },
];
