// 产品页第 2 屏（ClinkAI Ads）：七个不同的示例产品站成一圈。
// 位置、大小、角度、明暗都照抄 design/screens/page-products-ads.html，是 1440×900 画布上的像素。
// 七个品牌都是虚构的，图是 AI 生成的示例广告；哪一张「胜出」只是演示，这一屏不放任何结果数字。
// 这一屏只用广告图片和产品抠图，不放达人素材（design/assets/manifest.json 的 rules）。

/** 卡片上的抠图：在卡片原尺寸里的位置和大小 */
export interface RingCutout {
  file: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate?: number;
}

/** 一张示例广告 */
export interface RingCard {
  /** 外框在画布上的位置和大小 */
  left: number;
  top: number;
  width: number;
  height: number;
  /** 外框转的角度：只有后面露出来的版本是歪的 */
  rotate?: number;
  /** 卡片按这个原尺寸（宽、高）排版，再整体缩放进外框 */
  base: readonly [number, number];
  scale: number;
  /** 底色：dark 是图片加载前的深色（默认），cream 是米色，orange 是示例品牌 Halfmile 的橙色 */
  tone?: 'dark' | 'cream' | 'orange';
  /** 卡片上的字用墨色。默认是米色 */
  inkText?: boolean;
  /** 铺满卡片的图，src/assets/img/ 里的文件名 */
  image?: string;
  cutout?: RingCutout;
  /** 左上角的品牌名 */
  label?: string;
  /** 大字标题，一项一行 */
  headline?: readonly string[];
}

/**
 * 离观众的远近，0 是正中间（最近、最大、最亮），3 是最两边（最远、最小、最暗）。
 * 同一档的东西明暗、模糊和「胜出」小标签的大小都一样。
 */
export type RingDepth = 0 | 1 | 2 | 3;

export interface RingProduct {
  /** 虚构的示例品牌 */
  brand: string;
  depth: RingDepth;
  /** 后面露出来的其他版本，按从下往上叠的顺序 */
  back: readonly RingCard[];
  /** 最前面那张：这一轮「胜出」的版本 */
  front: RingCard;
  /** 「胜出」小标签左上角在画布上的位置 */
  tag: { left: number; top: number };
}

/** 每一档的明暗和模糊：后面的版本比最前面那张更暗 */
export const RING_DEPTHS: Record<
  RingDepth,
  {
    back: { brightness: number; blur?: number };
    front: { brightness?: number; blur?: number };
  }
> = {
  0: { back: { brightness: 0.55 }, front: {} },
  1: { back: { brightness: 0.51 }, front: { brightness: 0.92 } },
  2: {
    back: { brightness: 0.43, blur: 0.4 },
    front: { brightness: 0.78, blur: 0.4 },
  },
  3: {
    back: { brightness: 0.34, blur: 0.9 },
    front: { brightness: 0.62, blur: 0.9 },
  },
};

// 四种原尺寸：竖 4:5、方、横 3:2，还有两张更窄的竖图
const PORTRAIT = [224, 280] as const;
const SQUARE = [280, 280] as const;
const LANDSCAPE = [420, 280] as const;

/** 七个产品，从左到右（design/copy.md「第 2 屏」的表） */
export const RING_PRODUCTS: readonly RingProduct[] = [
  {
    brand: 'Nookbot',
    depth: 3,
    back: [
      {
        left: 39,
        top: 436,
        width: 124,
        height: 155,
        rotate: 7,
        base: PORTRAIT,
        scale: 0.5529,
        image: 'nook_stripes.jpg',
      },
    ],
    front: {
      left: -105,
      top: 462,
      width: 258,
      height: 172,
      base: LANDSCAPE,
      scale: 0.6143,
      image: 'nook_earring.jpg',
      label: 'NOOKBOT',
    },
    tag: { left: 14, top: 469 },
  },
  {
    brand: 'Dawnroast',
    depth: 2,
    back: [
      {
        left: 43,
        top: 390,
        width: 163,
        height: 203,
        rotate: -8,
        base: PORTRAIT,
        scale: 0.7264,
        image: 'dawn_alarm.jpg',
      },
      {
        left: 178,
        top: 401,
        width: 163,
        height: 203,
        rotate: 7,
        base: PORTRAIT,
        scale: 0.7264,
        tone: 'cream',
        inkText: true,
        cutout: {
          file: 'dawn_cut_bag.webp',
          left: 30,
          top: 46,
          width: 166,
          height: 190,
        },
      },
    ],
    front: {
      left: 79,
      top: 435,
      width: 226,
      height: 226,
      base: SQUARE,
      scale: 0.8071,
      image: 'dawn_sun.jpg',
      label: 'DAWNROAST',
    },
    tag: { left: 245, top: 444 },
  },
  {
    brand: 'Fieldcell',
    depth: 1,
    back: [
      {
        left: 214,
        top: 349,
        width: 280,
        height: 187,
        rotate: -8,
        base: LANDSCAPE,
        scale: 0.6667,
        image: 'field_ooh.jpg',
      },
      {
        left: 376,
        top: 363,
        width: 229,
        height: 229,
        rotate: 7,
        base: SQUARE,
        scale: 0.8165,
        image: 'field_knoll.jpg',
      },
    ],
    front: {
      left: 308,
      top: 406,
      width: 227,
      height: 284,
      base: PORTRAIT,
      scale: 1.0143,
      image: 'field_deer.jpg',
      label: 'FIELDCELL',
    },
    tag: { left: 462, top: 417 },
  },
  {
    brand: 'Halfmile',
    depth: 0,
    back: [
      {
        left: 492,
        top: 306,
        width: 249,
        height: 311,
        rotate: -8,
        base: PORTRAIT,
        scale: 1.1121,
        image: 'halfmile_dandelion.jpg',
      },
      {
        left: 685,
        top: 323,
        width: 279,
        height: 279,
        rotate: 7,
        base: SQUARE,
        scale: 0.9947,
        image: 'halfmile_puddle.jpg',
      },
    ],
    front: {
      left: 547,
      top: 375,
      width: 346,
      height: 346,
      base: SQUARE,
      scale: 1.2357,
      tone: 'orange',
      inkText: true,
      headline: ['Land', 'softer.'],
      cutout: {
        file: 'halfmile_cut_shoe.webp',
        left: 8,
        top: 128,
        width: 296,
        height: 151,
        rotate: -8,
      },
    },
    tag: { left: 801, top: 389 },
  },
  {
    brand: 'Acme Charge',
    depth: 1,
    back: [
      {
        left: 810,
        top: 349,
        width: 280,
        height: 187,
        rotate: -8,
        base: LANDSCAPE,
        scale: 0.6667,
        image: 'acme_ooh.jpg',
      },
      {
        left: 946,
        top: 363,
        width: 280,
        height: 187,
        rotate: 7,
        base: LANDSCAPE,
        scale: 0.6667,
        image: 'acme_road.jpg',
      },
    ],
    front: {
      left: 904,
      top: 406,
      width: 227,
      height: 284,
      base: PORTRAIT,
      scale: 1.0143,
      image: 'acme_moon.jpg',
      label: 'ACME CHARGE',
    },
    tag: { left: 1058, top: 417 },
  },
  {
    brand: 'Dewlab',
    depth: 2,
    back: [
      {
        left: 1111,
        top: 390,
        width: 163,
        height: 203,
        rotate: -8,
        base: PORTRAIT,
        scale: 0.7264,
        image: 'dew_dots.jpg',
      },
      {
        left: 1226,
        top: 401,
        width: 114,
        height: 203,
        rotate: 7,
        base: [158, 280],
        scale: 0.7264,
        image: 'dew_shelf.jpg',
      },
    ],
    // 品牌名和标题画在图里，不另外排字（design/copy.md）
    front: {
      left: 1163,
      top: 435,
      width: 151,
      height: 226,
      base: [187, 280],
      scale: 0.8071,
      image: 'dew_ooh.jpg',
    },
    tag: { left: 1253, top: 444 },
  },
  {
    brand: 'Nibbl',
    depth: 3,
    back: [
      {
        left: 1287,
        top: 428,
        width: 138,
        height: 138,
        rotate: -8,
        base: SQUARE,
        scale: 0.4945,
        image: 'nibbl_tv.jpg',
      },
    ],
    front: {
      left: 1329,
      top: 462,
      width: 138,
      height: 172,
      base: PORTRAIT,
      scale: 0.6143,
      image: 'nibbl_away.jpg',
      inkText: true,
      label: 'NIBBL',
    },
    tag: { left: 1380, top: 469 },
  },
];

/**
 * 画的顺序，后画的压在先画的上面：从最远的产品到最近的；同样远的先左后右。
 * 设计稿里先画完所有后面的版本，再画所有最前面的，最后是「胜出」小标签，都按这个顺序。
 */
export const ringPaintOrder = (
  products: readonly RingProduct[] = RING_PRODUCTS,
): RingProduct[] =>
  products
    .map((product, index) => ({ product, index }))
    .sort((a, b) => b.product.depth - a.product.depth || a.index - b.index)
    .map(({ product }) => product);

/** 一张卡片的滤镜：正中间最前面那张不加 */
export function ringFilter(look: {
  brightness?: number;
  blur?: number;
}): string | undefined {
  const parts = [
    look.brightness === undefined ? '' : `brightness(${look.brightness})`,
    look.blur === undefined ? '' : `blur(${look.blur}px)`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}
