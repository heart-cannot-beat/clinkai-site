// 首屏（design/screens/01-hero.html）叠板上的三张示例图。整站只有它们是首屏的图：
// 立即加载、优先下载，总体积有上限（budget.ts）。首页（P-01）的叠板用这里的数。

/** 三块板上的图，按设计稿里出现的顺序（从下往上） */
export const HERO_BOARD_IMAGES = [
  'acme_moon.jpg',
  'ugc_dawn.jpg',
  'dew_dots.jpg',
] as const;

/** 叠板是 280×280 的方块，整摞放大 1.36 倍：图在画布上铺开约 381 像素 */
export const HERO_BOARD = { size: 280, scale: 1.36 } as const;

export const HERO_IMAGE_SIZE = Math.round(HERO_BOARD.size * HERO_BOARD.scale);
