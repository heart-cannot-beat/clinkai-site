// 示例图的多尺寸规则：每张图出哪几种宽度、页面上用多大、sizes 怎么写。
// 只有算术，不碰图片处理，picture.ts 和首屏体积检查都按这里算。

/** 设计稿画布的宽度。design/screens/ 里每屏都是 1440×900，坐标都是这块画布上的像素 */
export const CANVAS_WIDTH = 1440;

/**
 * 每张图都按这几档宽度出图（比原图窄的那几档），再加上原图宽度本身，不放大。
 * 320 够手机和版本墙里的小图，640 和 960 是常见的 1 倍、2 倍屏，1280 给大图。
 * 和原图宽度差不到 15% 的那一档不出，免得两张几乎一样的文件。
 */
export const WIDTH_STEPS = [320, 640, 960, 1280] as const;

const NEAR_ORIGINAL = 0.85;

export function candidateWidths(originalWidth: number): number[] {
  const steps = WIDTH_STEPS.filter(
    (step) => step <= originalWidth * NEAR_ORIGINAL,
  );
  // 原图本身就很小（比如 256 的头像）：至少再出一张一半宽的
  if (steps.length === 0) return [Math.round(originalWidth / 2), originalWidth];
  return [...steps, originalWidth];
}

export interface DisplayBox {
  /** 图在 1440 宽画布上显示的宽度（像素，算上缩放） */
  width: number;
  /**
   * 显示区域的高度。给了它，就当作 object-fit: cover 铺满 width×height 的框：
   * 原图比框扁时，图实际铺开的宽度比框宽，要按铺开的宽度出图才不糊。
   */
  height?: number;
}

/** 图在画布上实际铺开的宽度（像素） */
export function displayWidth(
  original: { width: number; height: number },
  box: DisplayBox,
): number {
  if (box.height === undefined) return box.width;
  const coverWidth = (box.height * original.width) / original.height;
  return Math.round(Math.max(box.width, coverWidth));
}

/**
 * sizes 属性。屏幕按 1440 宽的画布排版：
 * - 视口不小于 1440 时，假定画布跟着视口等比放大，图宽 = 画布上的宽度 / 1440 × 100vw；
 * - 视口更窄时，假定画布不缩小，图宽就是画布上的像素数。
 * 手机稿（P-02）定了之后，手机上的写法在这里补一条。
 */
export function sizesFor(width: number): string {
  const vw = Math.round((width / CANVAS_WIDTH) * 100 * 100) / 100;
  return `(min-width: ${CANVAS_WIDTH}px) ${vw}vw, ${width}px`;
}
