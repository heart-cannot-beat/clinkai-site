// 场景运行时在浏览器里的接线。由 Scene.astro 的脚本调用；一页不管有几个场景只起一次。
import { resolveSceneMode, STATIC_QUERY } from './mode';
import { sceneLoaders } from './registry';
import { createSceneRuntime, SCENE_SELECTOR } from './runtime';

let started = false;

export function startScenes(): void {
  if (started) return;
  started = true;

  const media = window.matchMedia(STATIC_QUERY);
  const runtime = createSceneRuntime({
    root: document.documentElement,
    scenes: [...document.querySelectorAll<HTMLElement>(SCENE_SELECTOR)],
    loaders: sceneLoaders,
    readMode: () =>
      resolveSceneMode({
        staticMedia: media.matches,
        userAgent: navigator.userAgent,
      }),
    // 很老的 Safari 没有这个方法：那就只在打开页面时定一次，不跟着环境变
    watchMode: (onChange) => media.addEventListener?.('change', onChange),
    // GSAP 在单独的文件里，只有动效模式才会走到这一行去下载
    loadGsap: () => import('./gsap'),
  });
  void runtime.apply();
}
