// 示例场景（M-01）：最简单的一屏，只为证明进度绑定和退路都能用，不是哪一屏的动效。
// 画面在 src/pages/parts/scene.astro。往下滚：横条从空到满，三格依次亮起，数字跟着进度走。
import { defineScene } from './define';

export default defineScene(({ sticky, timeline, onProgress }) => {
  const fill = sticky.querySelector<HTMLElement>('[data-demo-fill]');
  const steps = [...sticky.querySelectorAll<HTMLElement>('[data-demo-step]')];
  const readout = sticky.querySelector<HTMLElement>('[data-demo-progress]');
  if (!fill || !readout || steps.length === 0) {
    throw new Error('示例场景的画面不全');
  }

  // 位置和时长直接写进度。0 → 1：横条从空到满
  timeline.fromTo(fill, { scaleX: 0 }, { scaleX: 1, duration: 1 }, 0);

  // 进度平分成几段，每段开头亮一格
  steps.forEach((step, index) => {
    timeline.fromTo(
      step,
      { opacity: 0.3 },
      { opacity: 1, duration: 0.1 },
      index / steps.length,
    );
  });

  // 时间线不好表达的事（这里是换数字）放 onProgress
  const still = readout.textContent;
  onProgress((progress) => {
    readout.textContent = progress.toFixed(2);
  });

  // 文字是自己改的，GSAP 不知道：退回静态帧时改回去
  return () => {
    readout.textContent = still;
  };
});
