// 画出第一帧之前跑的内联脚本。只在构建时用（Scene.astro 把它写进页面），
// 单独放一个文件，免得这段文字被打进浏览器加载的运行时里。
// 判断用的规则都来自 mode.ts；和运行时的判断是否一致，mode.test.ts 会比对。
import {
  SCENE_MODE_ATTRIBUTE,
  SCENE_SCALE_PROPERTY,
  STATIC_QUERY,
  WECHAT_USER_AGENT,
} from './mode';

/** 设计稿的画布 */
const CANVAS_WIDTH = 1440;
const CANVAS_HEIGHT = 900;

/**
 * 内联脚本的正文，由 Scene.astro 放在每个场景前面，赶在这一屏画出来之前跑：
 * 定下这一页是动效还是静态帧，并算好画布的缩放比例（照两份小样：「宽 ÷ 1440」和
 * 「高 ÷ 900」里小的那个）。这样页面不会先按静态的高度排一遍再跳。
 * 一页有好几个场景时只有第一段起作用。
 * 这段脚本没有跑（浏览器没开脚本）时，<html> 上没有这个属性，样式按静态帧处理。
 */
export const sceneBootScript = `(function () {
  var root = document.documentElement;
  if (root.hasAttribute('${SCENE_MODE_ATTRIBUTE}')) return;
  var still =
    window.matchMedia(${JSON.stringify(STATIC_QUERY)}).matches ||
    ${String(WECHAT_USER_AGENT)}.test(navigator.userAgent);
  root.setAttribute('${SCENE_MODE_ATTRIBUTE}', still ? 'static' : 'motion');
  var fit = function () {
    root.style.setProperty(
      '${SCENE_SCALE_PROPERTY}',
      String(Math.min(root.clientWidth / ${CANVAS_WIDTH}, window.innerHeight / ${CANVAS_HEIGHT}))
    );
  };
  fit();
  window.addEventListener('resize', fit);
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(root);
})();`;
