// 示例视频的播放规则（design/motion.md 04 屏）。ExampleVideo 组件里的脚本按这里判断。

/** 系统开了「减少动态效果」 */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * 手机。还没有手机稿（P-02），先按常见的竖屏手机宽度划一条线；
 * 手机稿定了之后，和滚动动效的「手机退路」用同一条。
 */
export const PHONE_QUERY = '(max-width: 767px)';

/** 视频露出多少才开始播：一半 */
export const PLAY_THRESHOLD = 0.5;

/** 能不能播：开了减少动态效果、或者在手机上，都只显示封面图 */
export function canPlay(viewer: {
  reducedMotion: boolean;
  phone: boolean;
}): boolean {
  return !viewer.reducedMotion && !viewer.phone;
}
