// 场景运行时的测试。GSAP 的内核是真的（时间线怎么算是真的），ScrollTrigger 换成一个假的：
// 它只记下运行时传给它的绑定方式；测试自己把时间线拨到某个进度，代替真的滚动。
// 真的滚动、真的 sticky 在浏览器里看（示例页 /parts/scene/，证据在 PR 里）。
import { gsap } from 'gsap';
import { Window } from 'happy-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneBuild } from './define';
import { SCENE_MODE_ATTRIBUTE, type SceneMode } from './mode';
import {
  createSceneRuntime,
  type GsapBundle,
  SCENE_READY_ATTRIBUTE,
  STICKY_SELECTOR,
} from './runtime';

interface Binding {
  vars: Record<string, unknown>;
  animation: gsap.core.Timeline;
}

const bindings: Binding[] = [];

// GSAP 按插件的名字登记，所以这个类必须叫 ScrollTrigger
class ScrollTrigger {
  // 测试跑在 Node 里，没有 window：GSAP 只登记标了 headless 的插件
  static headless = true;

  static create(vars: Record<string, unknown>, animation: gsap.core.Timeline) {
    // 真的 ScrollTrigger 也会接管时间线：不让它自己随时间往前走
    animation.pause();
    bindings.push({ vars, animation });
  }
}

const realGsap = async (): Promise<GsapBundle> => ({ gsap, ScrollTrigger });

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(options: {
  mode?: SceneMode;
  /** 场景名 → 场景模块 */
  builds: Record<string, SceneBuild>;
  /** 页面上有哪些场景；不写就是 builds 里的全部 */
  onPage?: string[];
  loadGsap?: () => Promise<GsapBundle>;
}) {
  const document = new Window().document;
  const names = options.onPage ?? Object.keys(options.builds);
  document.body.innerHTML = names
    .map(
      (name) => `<div data-scene="${name}"><div data-scene-sticky></div></div>`,
    )
    .join('');
  const root = document.documentElement as unknown as HTMLElement;
  const scenes = [
    ...document.querySelectorAll('[data-scene]'),
  ] as unknown as HTMLElement[];

  let mode = options.mode ?? 'motion';
  let notify = () => {};
  const loadGsap = vi.fn(options.loadGsap ?? realGsap);
  const loaders = new Map(
    Object.entries(options.builds).map(([name, build]) => [
      name,
      vi.fn(async () => ({ default: build })),
    ]),
  );
  const report = vi.fn();

  const runtime = createSceneRuntime({
    root,
    scenes,
    loaders,
    readMode: () => mode,
    watchMode: (onChange) => {
      notify = onChange;
    },
    loadGsap,
    report,
  });

  return {
    root,
    scenes,
    runtime,
    loadGsap,
    loaders,
    report,
    mode: () => root.getAttribute(SCENE_MODE_ATTRIBUTE),
    /** 环境变了：比如窗口拉窄到手机的宽度，或者开关了「减少动态效果」 */
    async switchTo(next: SceneMode) {
      mode = next;
      notify();
      await settle();
    },
  };
}

beforeEach(() => {
  bindings.length = 0;
});

describe('静态帧', () => {
  it('不加载 GSAP，也不加载场景模块', async () => {
    const page = setup({ mode: 'static', builds: { demo: vi.fn() } });

    await page.runtime.apply();

    expect(page.loadGsap).not.toHaveBeenCalled();
    expect(page.loaders.get('demo')).not.toHaveBeenCalled();
    expect(bindings).toHaveLength(0);
    expect(page.mode()).toBe('static');
    expect(page.scenes[0]!.hasAttribute(SCENE_READY_ATTRIBUTE)).toBe(false);
  });
});

describe('动效', () => {
  it('每个场景一条时间线，绑在自己外层的滚动进度上：只有 scrub，不用 ScrollTrigger 的固定', async () => {
    const page = setup({ builds: { first: vi.fn(), second: vi.fn() } });

    await page.runtime.apply();

    expect(page.mode()).toBe('motion');
    expect(page.loadGsap).toHaveBeenCalledTimes(1);
    expect(bindings.map((binding) => binding.vars)).toEqual([
      {
        trigger: page.scenes[0],
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
      },
      {
        trigger: page.scenes[1],
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
      },
    ]);
    for (const scene of page.scenes) {
      expect(scene.hasAttribute(SCENE_READY_ATTRIBUTE)).toBe(true);
    }
  });

  it('时间线总长是 1：位置和时长就是进度，默认匀速', async () => {
    const box = { x: 0 };
    const page = setup({
      builds: {
        demo: ({ timeline }) => {
          timeline.to(box, { x: 100, duration: 0.5 }, 0.25);
        },
      },
    });

    await page.runtime.apply();
    const { animation } = bindings[0]!;

    expect(animation.duration()).toBe(1);
    animation.progress(0.1);
    expect(box.x).toBe(0);
    animation.progress(0.5);
    expect(box.x).toBeCloseTo(50);
    animation.progress(0.75);
    expect(box.x).toBeCloseTo(100);
    animation.progress(1);
    expect(box.x).toBeCloseTo(100);
  });

  it('onProgress：登记时先按当前进度调用一次，之后进度每变一次调用一次', async () => {
    const seen: number[] = [];
    const page = setup({
      builds: {
        demo: ({ onProgress }) => onProgress((progress) => seen.push(progress)),
      },
    });

    await page.runtime.apply();
    expect(seen).toEqual([0]);

    bindings[0]!.animation.progress(0.4);
    bindings[0]!.animation.progress(1);

    expect(seen).toHaveLength(3);
    expect(seen[1]).toBeCloseTo(0.4);
    expect(seen[2]).toBe(1);
  });

  it('交给场景模块的是这一屏自己的固定层', async () => {
    const stickies: HTMLElement[] = [];
    const build: SceneBuild = ({ sticky }) => void stickies.push(sticky);
    const page = setup({ builds: { first: build, second: build } });

    await page.runtime.apply();

    expect(stickies).toEqual(
      page.scenes.map((scene) => scene.querySelector(STICKY_SELECTOR)),
    );
  });
});

describe('开着页面时环境变了', () => {
  function movingBox() {
    const box = { x: 0 };
    const cleanup = vi.fn();
    const build: SceneBuild = ({ timeline }) => {
      timeline.fromTo(box, { x: 30 }, { x: 100, duration: 1 }, 0);
      return cleanup;
    };
    return { box, cleanup, build };
  }

  it('变成静态帧：GSAP 改过的值还原，场景自己的清理函数被调用，标记撤掉', async () => {
    const { box, cleanup, build } = movingBox();
    const page = setup({ builds: { demo: build } });
    await page.runtime.apply();
    bindings[0]!.animation.progress(0.5);
    expect(box.x).toBeCloseTo(65);

    await page.switchTo('static');

    expect(page.mode()).toBe('static');
    expect(box.x).toBe(0);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(page.scenes[0]!.hasAttribute(SCENE_READY_ATTRIBUTE)).toBe(false);
  });

  it('再变回动效：重新建时间线', async () => {
    const { box, build } = movingBox();
    const page = setup({ builds: { demo: build } });
    await page.runtime.apply();
    await page.switchTo('static');

    await page.switchTo('motion');

    expect(page.mode()).toBe('motion');
    expect(bindings).toHaveLength(2);
    bindings[1]!.animation.progress(1);
    expect(box.x).toBeCloseTo(100);
  });

  it('GSAP 还在下载时变成了静态帧：下载完也不再建时间线', async () => {
    let finishDownload = () => {};
    const page = setup({
      builds: { demo: vi.fn() },
      loadGsap: () =>
        new Promise((resolve) => {
          finishDownload = () => resolve({ gsap, ScrollTrigger });
        }),
    });
    const applying = page.runtime.apply();
    await settle();

    await page.switchTo('static');
    finishDownload();
    await applying;

    expect(page.mode()).toBe('static');
    expect(bindings).toHaveLength(0);
    expect(page.report).not.toHaveBeenCalled();
  });
});

describe('出错时整页退回静态帧', () => {
  it('GSAP 没加载成功', async () => {
    const failure = new Error('下载失败');
    const page = setup({
      builds: { demo: vi.fn() },
      loadGsap: () => Promise.reject(failure),
    });

    await page.runtime.apply();

    expect(page.mode()).toBe('static');
    expect(page.report).toHaveBeenCalledWith(failure);
    expect(bindings).toHaveLength(0);
  });

  it('页面上的场景没有对应的模块', async () => {
    const page = setup({ builds: {}, onPage: ['ghost'] });

    await page.runtime.apply();

    expect(page.mode()).toBe('static');
    expect(String(page.report.mock.calls[0]?.[0])).toContain('ghost.scene.ts');
  });

  it('有一个场景的时间线超过了 1：前面已经建好的也一起撤掉', async () => {
    const box = { x: 0 };
    const page = setup({
      builds: {
        fine: ({ timeline }) => {
          timeline.fromTo(box, { x: 30 }, { x: 100, duration: 1 }, 0);
        },
        tooLong: ({ timeline }) => {
          timeline.to({}, { duration: 1 }, 0.5);
        },
      },
    });

    await page.runtime.apply();

    expect(page.mode()).toBe('static');
    expect(String(page.report.mock.calls[0]?.[0])).toContain('tooLong');
    expect(box.x).toBe(0);
    for (const scene of page.scenes) {
      expect(scene.hasAttribute(SCENE_READY_ATTRIBUTE)).toBe(false);
    }
  });
});
