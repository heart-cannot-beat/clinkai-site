// 场景模块的写法。每屏一个文件，命名 <场景名>.scene.ts，默认导出 defineScene(...)。
// 这里只引 GSAP 的类型：GSAP 本身由运行时按需加载，静态帧下不下载（见 start.ts）。
import type { gsap } from 'gsap';

export type Gsap = typeof gsap;
export type SceneTimeline = gsap.core.Timeline;

export interface SceneContext {
  /** 这一屏固定在屏幕上的那一层（position: sticky）。要动的元素都从它往下找 */
  sticky: HTMLElement;
  gsap: Gsap;
  /**
   * 这一屏的时间线，已经绑到滚动进度上，总长是 1：
   * 位置和时长直接写进度，照 design/motion.md 的表格抄。
   * 比如「0.15 → 0.45」写成 timeline.to(目标, { ..., duration: 0.3 }, 0.15)。
   * 默认匀速（ease: 'none'），要缓动的自己在那一段上写。
   */
  timeline: SceneTimeline;
  /**
   * 进度每变一次就调用一次，登记时先按当前进度调用一次。
   * 时间线不好表达的事放这里：按公式摆位置、换数字、换文字。
   */
  onProgress(render: (progress: number) => void): void;
}

/**
 * 往时间线上加这一屏的动效。GSAP 改过的样式，退回静态帧时会自动还原；
 * 自己动手改的（文字、类名、不经 GSAP 写的样式）要返回一个函数把它们改回去。
 */
export type SceneBuild = (context: SceneContext) => void | (() => void);

export function defineScene(build: SceneBuild): SceneBuild {
  return build;
}
