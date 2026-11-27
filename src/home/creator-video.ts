// 04 屏中间那条达人示例视频的播放规则，照 design/motion.md「04 达人」：
// - 进入视口才加载（标签上是 preload="none"）并从头播放，离开视口就暂停；
// - 永远静音；
// - 三条退路都落在同一个结果上：视频不显示，露出垫在下面的封面图。
//   1. 系统开了「减少动态效果」：不播放；
//   2. 手机：先只显示封面图（等手机稿定了再决定播不播）；
//   3. 视频加载失败，或浏览器不让自动播放：视频一直没有真正播起来，就一直不显示。
// 这里不碰 document 和 window，浏览器那头的接线在 CreatorsScreen.astro 的脚本里，所以能单独测。

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * 「手机」的判断。交接包还没有手机稿，也没定断点，这里先按视口宽度不到 768px 算；
 * 手机稿（P-02）定了以后改这里。
 */
export const PHONE_QUERY = '(max-width: 767px)';

/** 视频露出多少算「进入视口」 */
export const VISIBLE_RATIO = 0.25;

/** 真正在播的时候加在 <video> 上的属性；样式靠它决定视频显示不显示 */
export const PLAYING_ATTRIBUTE = 'data-playing';

/** 用到的 <video> 的那一小部分 */
export interface CreatorVideo {
  muted: boolean;
  currentTime: number;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  addEventListener(type: 'playing' | 'error', listener: () => void): void;
}

/** 用到的 matchMedia 结果的那一小部分 */
export interface MediaCondition {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
}

export interface CreatorVideoEnvironment {
  matchMedia(query: string): MediaCondition;
  /** 视频进入或离开视口时调用 onChange */
  watchVisibility(onChange: (visible: boolean) => void): void;
}

export function setupCreatorVideo(
  video: CreatorVideo,
  environment: CreatorVideoEnvironment,
): void {
  // 标签上已经有 muted；这里再设一次，保证任何情况下都不出声
  video.muted = true;

  const blockers = [
    environment.matchMedia(REDUCED_MOTION_QUERY),
    environment.matchMedia(PHONE_QUERY),
  ];
  let visible = false;
  let active = false;

  const showCover = () => video.removeAttribute(PLAYING_ATTRIBUTE);

  const update = () => {
    const next = visible && blockers.every((blocker) => !blocker.matches);
    if (next === active) return;
    active = next;

    if (active) {
      video.currentTime = 0;
      // 浏览器不让自动播放，或者还没播起来就被暂停：都不算错，留在封面图上
      video.play().catch(() => {});
    } else {
      video.pause();
      showCover();
    }
  };

  // 画面真的动起来了才把视频显示出来
  video.addEventListener('playing', () => {
    if (active && !video.paused) video.setAttribute(PLAYING_ATTRIBUTE, '');
  });
  video.addEventListener('error', showCover);

  for (const blocker of blockers) blocker.addEventListener('change', update);
  environment.watchVisibility((nowVisible) => {
    visible = nowVisible;
    update();
  });
}
