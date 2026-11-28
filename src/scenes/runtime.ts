// 场景运行时：定下这一页是动效还是静态帧；动效时才加载 GSAP，给每个场景建一条时间线，
// 绑到这一屏的滚动进度上。固定在屏幕上靠样式里的 position: sticky（Scene.astro），
// ScrollTrigger 在这里只做「滚到哪，时间线就到哪」这一件事，不用它自己的固定功能。
// 浏览器里的接线在 start.ts；这个文件不直接碰 window，方便测试。
import type { Gsap, SceneBuild } from './define';
import { SCENE_MODE_ATTRIBUTE, type SceneMode } from './mode';
import type { SceneLoader } from './registry';

/** 场景的外层：高度是若干个屏高，滚过它的这一段就是进度 0 到 1 */
export const SCENE_SELECTOR = '[data-scene]';
/** 外层里面固定在屏幕上的那一层 */
export const STICKY_SELECTOR = '[data-scene-sticky]';
/**
 * 时间线建好以后记在外层上。动效模式下 GSAP 还没下载完的那一小会儿没有这个属性，
 * 样式可以靠它把「进度 0 时不该露面」的东西先藏着。
 */
export const SCENE_READY_ATTRIBUTE = 'data-scene-ready';

export interface GsapBundle {
  gsap: Gsap;
  /** 只用来注册成插件 */
  ScrollTrigger: object;
}

export interface SceneRuntimeOptions {
  /** <html>：这一页是动效还是静态帧记在它上面 */
  root: HTMLElement;
  /** 页面上所有场景的外层 */
  scenes: HTMLElement[];
  /** 场景名 → 加载这个场景模块的函数 */
  loaders: ReadonlyMap<string, SceneLoader>;
  /** 现在该是哪一种 */
  readMode(): SceneMode;
  /** 环境变了（窗口拉窄到手机的宽度、开关「减少动态效果」）时调用 onChange */
  watchMode(onChange: () => void): void;
  /** 加载 GSAP 和 ScrollTrigger。只在动效模式下才会被调用 */
  loadGsap(): Promise<GsapBundle>;
  /** 出错时报到哪里，默认 console.error */
  report?(error: unknown): void;
}

export interface SceneRuntime {
  /** 按当前环境摆好：动效就加载 GSAP、建时间线；静态帧就什么都不加载 */
  apply(): Promise<void>;
}

/**
 * 一屏的时间线怎么绑到滚动进度：外层的顶边到屏幕顶边时是 0，外层的底边到屏幕底边时是 1。
 * 只有 scrub，不传 ScrollTrigger 的固定选项。
 */
export function scrollBinding(scene: HTMLElement) {
  return {
    trigger: scene,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
  } as const;
}

function sceneName(scene: HTMLElement): string {
  return scene.getAttribute('data-scene') ?? '';
}

/** 给一个场景建时间线、绑进度，再交给场景模块往上加东西 */
function bindScene(
  gsap: Gsap,
  scene: HTMLElement,
  build: SceneBuild,
): (() => void) | void {
  const name = sceneName(scene);
  const sticky = scene.querySelector<HTMLElement>(STICKY_SELECTOR);
  if (!sticky) throw new Error(`场景「${name}」里没有固定层`);

  const timeline = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: scrollBinding(scene),
  });

  // 一段从 0 到 1 的空动画：把时间线的总长撑到 1，顺带把进度报给 onProgress 登记的函数
  const state = { progress: 0 };
  const renders: ((progress: number) => void)[] = [];
  timeline.to(
    state,
    {
      progress: 1,
      duration: 1,
      ease: 'none',
      onUpdate: () => {
        for (const render of renders) render(state.progress);
      },
    },
    0,
  );

  const cleanup = build({
    sticky,
    gsap,
    timeline,
    onProgress(render) {
      renders.push(render);
      render(state.progress);
    },
  });

  const length = timeline.duration();
  if (length > 1.000001) {
    throw new Error(
      `场景「${name}」的时间线总长是 ${length}，超过了 1：位置和时长要按进度（0 到 1）写`,
    );
  }
  return cleanup;
}

export function createSceneRuntime(options: SceneRuntimeOptions): SceneRuntime {
  const report = options.report ?? ((error: unknown) => console.error(error));
  const setMode = (mode: SceneMode) =>
    options.root.setAttribute(SCENE_MODE_ATTRIBUTE, mode);

  // 每次重新摆都换一个号：加载到一半环境又变了的那一次，回来时发现号不对就作废
  let turn = 0;
  let teardown: (() => void) | undefined;

  async function loadBuilds(): Promise<SceneBuild[]> {
    return Promise.all(
      options.scenes.map(async (scene) => {
        const name = sceneName(scene);
        const load = options.loaders.get(name);
        if (!load)
          throw new Error(`场景「${name}」没有对应的 ${name}.scene.ts`);
        return (await load()).default;
      }),
    );
  }

  async function apply(): Promise<void> {
    const current = ++turn;
    teardown?.();
    teardown = undefined;

    const mode = options.readMode();
    setMode(mode);
    if (mode === 'static' || options.scenes.length === 0) return;

    try {
      const [{ gsap, ScrollTrigger }, builds] = await Promise.all([
        options.loadGsap(),
        loadBuilds(),
      ]);
      if (current !== turn) return;

      gsap.registerPlugin(ScrollTrigger);
      // 建在一个 context 里：退回静态帧时一次还原所有样式、停掉所有时间线
      const context = gsap.context(() => {});
      const cleanups: (() => void)[] = [];
      teardown = () => {
        context.revert();
        for (const cleanup of cleanups) cleanup();
        for (const scene of options.scenes) {
          scene.removeAttribute(SCENE_READY_ATTRIBUTE);
        }
      };
      context.add(() => {
        options.scenes.forEach((scene, index) => {
          const cleanup = bindScene(gsap, scene, builds[index]!);
          if (cleanup) cleanups.push(cleanup);
          scene.setAttribute(SCENE_READY_ATTRIBUTE, '');
        });
      });
    } catch (error) {
      if (current !== turn) return;
      // GSAP 没加载成功，或者某个场景写错了：整页退回静态帧，不留半截动效
      teardown?.();
      teardown = undefined;
      setMode('static');
      report(error);
    }
  }

  options.watchMode(() => void apply());
  return { apply };
}
