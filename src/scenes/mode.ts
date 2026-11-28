// 滚动场景的退路（design/motion.md「通用规则」）：手机、微信内置浏览器、系统开了
// 「减少动态效果」时，不加载 GSAP，每屏显示静态帧。
// 规则只写在这一个文件里。用它的有两处：画出第一帧之前跑的内联脚本（boot.ts），
// 和之后加载的场景运行时（start.ts）。两处的判断必须一样，mode.test.ts 会比对。

/** 系统开了「减少动态效果」 */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * 「手机」。交接包没给断点，这里按两条算，命中一条就是：
 * 窄屏（768 以下）；或者主要靠手指操作、没有悬停的设备（横过来的手机和平板也在里面）。
 */
export const PHONE_QUERY =
  '(max-width: 767px), (hover: none) and (pointer: coarse)';

/** 命中就显示静态帧的媒体查询。微信要看浏览器标识，媒体查询表达不了，另算 */
export const STATIC_QUERY = `${REDUCED_MOTION_QUERY}, ${PHONE_QUERY}`;

/** 微信内置浏览器（手机和电脑上的都算，企业微信也带这一段） */
export const WECHAT_USER_AGENT = /MicroMessenger/i;

/** motion：加载 GSAP，时间线绑到滚动进度。static：不加载，显示静态帧 */
export type SceneMode = 'motion' | 'static';

/** 记在 <html> 上的属性。样式靠它决定外层要不要撑高、里面那层要不要固定 */
export const SCENE_MODE_ATTRIBUTE = 'data-scene-mode';

/** 1440×900 的画布放进一个屏高的固定层时的缩放比例，记在 <html> 上 */
export const SCENE_SCALE_PROPERTY = '--scene-scale';

export interface SceneEnvironment {
  /** STATIC_QUERY 命中了没有 */
  staticMedia: boolean;
  /** 浏览器标识（navigator.userAgent） */
  userAgent: string;
}

export function resolveSceneMode(environment: SceneEnvironment): SceneMode {
  return environment.staticMedia ||
    WECHAT_USER_AGENT.test(environment.userAgent)
    ? 'static'
    : 'motion';
}
