import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import IndexPage from '../src/pages/index.astro';
import PartsPage from '../src/pages/parts.astro';
import ScenePage from '../src/pages/parts/scene.astro';
import Scene from '../src/scenes/Scene.astro';
import { sceneBootScript } from '../src/scenes/boot';
import {
  collectScenes,
  sceneLoaders,
  sceneNameFromPath,
} from '../src/scenes/registry';

// 滚动场景的骨架（M-01）：外壳渲染出来的结构、场景模块的清单、示例页，
// 以及两条写在 CLAUDE.md 里的规则：GSAP 只按需加载；固定靠 sticky，不用 ScrollTrigger 的 pin。
// 降级规则在 src/scenes/mode.test.ts，运行时在 src/scenes/runtime.test.ts。

let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

describe('场景外壳', () => {
  const render = (props: { name: string; length: number }) =>
    container.renderToString(Scene, {
      props,
      slots: { default: '<p>这一屏的内容</p>' },
    });

  it('外层记着场景名和屏高数，里面是固定层，内容放在固定层里', async () => {
    const html = await render({ name: 'demo', length: 3 });

    expect(html).toMatch(
      /<div[^>]*\bdata-scene="demo"[^>]*>\s*<div[^>]*\bdata-scene-sticky\b[^>]*>\s*<p>这一屏的内容<\/p>\s*<\/div>\s*<\/div>/,
    );
    expect(html).toMatch(
      /<div[^>]*data-scene="demo"[^>]*style="--scene-length: 3"/,
    );
  });

  it('前面带着定动效还是静态帧的内联脚本，排在这一屏之前', async () => {
    const html = await render({ name: 'demo', length: 3 });
    const script = html.indexOf(sceneBootScript);

    expect(script).toBeGreaterThan(-1);
    expect(script).toBeLessThan(html.indexOf('data-scene="demo"'));
  });

  it('默认就是静态帧：渲染出来的 HTML 不带动效的标记，要等脚本来定', async () => {
    const html = await render({ name: 'demo', length: 3 });

    expect(html).not.toMatch(/<[a-z][^>]*\sdata-scene-mode=/);
    expect(html).not.toMatch(/<[a-z][^>]*\sdata-scene-ready/);
  });

  it('没有对应的 .scene.ts：构建时就报错', async () => {
    await expect(render({ name: 'ghost', length: 3 })).rejects.toThrow(
      'ghost.scene.ts',
    );
  });

  it.each([1, 0, Number.NaN])('length 是 %s：构建时就报错', async (length) => {
    await expect(render({ name: 'demo', length })).rejects.toThrow('length');
  });
});

describe('场景模块的清单', () => {
  it('按文件名登记', () => {
    expect(sceneNameFromPath('../home/01-hero.scene.ts')).toBe('01-hero');
    expect(sceneNameFromPath('./demo.scene.ts')).toBe('demo');
  });

  it('示例场景在清单里', () => {
    expect(sceneLoaders.has('demo')).toBe(true);
  });

  it('清单里每个模块的默认导出都是一个函数', async () => {
    for (const [name, load] of sceneLoaders) {
      expect(typeof (await load()).default, name).toBe('function');
    }
  });

  it('两个文件重名时报错，不悄悄用其中一个', () => {
    const load = async () => ({ default: () => {} });

    expect(() =>
      collectScenes({
        '../home/wall.scene.ts': load,
        '../scenes/wall.scene.ts': load,
      }),
    ).toThrow('wall');
  });
});

describe('示例页', () => {
  let page = '';

  beforeAll(async () => {
    page = await container.renderToString(ScenePage);
  });

  it('不让搜索引擎收录', () => {
    expect(page).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it('一个场景，里面是首页同一套 1440×900 的画布', () => {
    expect(page.match(/\sdata-scene="/g)).toHaveLength(1);
    expect(page).toMatch(
      /data-scene="demo"[\s\S]*data-scene-sticky[\s\S]*data-screen="scene-demo"/,
    );
  });

  it('HTML 里写的是静态帧（结束时的样子），没有脚本也能看', () => {
    expect(page).toMatch(/<p[^>]*data-demo-progress[^>]*>1\.00<\/p>/);
    expect(page.match(/data-demo-step/g)).toHaveLength(3);
  });

  it('静态帧下画布按页面宽度缩放，比例在 <head> 里算', () => {
    const head = page.slice(0, page.indexOf('</head>'));

    expect(head).toMatch(/<script>[\s\S]*--home-scale[\s\S]*<\/script>/);
  });

  it('部件陈列页有到示例页的链接', async () => {
    const parts = await container.renderToString(PartsPage);

    expect(parts).toContain('href="/parts/scene/"');
  });
});

describe('首页', () => {
  it('这一单不接入：首页上还没有场景', async () => {
    const home = await container.renderToString(IndexPage);

    expect(home).not.toMatch(/\sdata-scene[=\s>-]/);
    expect(home).not.toContain(sceneBootScript);
  });
});

describe('规则', () => {
  const sources = Object.entries(
    import.meta.glob<string>('../src/**/*.{astro,ts}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ).filter(([path]) => !path.endsWith('.test.ts'));

  const GSAP_FILE = '../src/scenes/gsap.ts';
  // 场景模块本身只在动效模式下才加载，里面可以再引 GSAP 的其他插件
  const isSceneModule = (path: string) => path.endsWith('.scene.ts');

  it('src/ 里有文件可查', () => {
    expect(sources.length).toBeGreaterThan(30);
    expect(sources.map(([path]) => path)).toContain(GSAP_FILE);
  });

  it('只有 src/scenes/gsap.ts 直接引 GSAP，别处只引类型', () => {
    for (const [path, text] of sources) {
      if (path === GSAP_FILE || isSceneModule(path)) continue;

      const imports = [
        ...text.matchAll(
          /\bimport\b([^;'"]*)from\s*['"]gsap(?:\/[^'"]*)?['"]/g,
        ),
      ];
      for (const [statement, names] of imports) {
        expect(names, `${path}：${statement}`).toMatch(/^\s+type\s/);
      }
      // 不带 from 的写法：import 'gsap' 和 import('gsap')
      expect(text, path).not.toMatch(/\bimport\s*\(?\s*['"]gsap(?:\/|['"])/);
    }
  });

  it('gsap.ts 只用 import() 按需加载，没有哪个文件静态引它', () => {
    for (const [path, text] of sources) {
      expect(text, path).not.toMatch(/from\s*['"][^'"]*\/gsap(?:\.ts)?['"]/);
    }
    const start = sources.find(([path]) => path === '../src/scenes/start.ts');

    expect(start?.[1]).toMatch(/import\(\s*['"]\.\/gsap['"]\s*\)/);
  });

  it('固定靠 sticky：代码里不出现 ScrollTrigger 的 pin 选项', () => {
    for (const [path, text] of sources) {
      expect(text, path).not.toMatch(
        /\b(?:pin|pinSpacing|pinType|pinReparent|pinnedContainer|anticipatePin)\s*:/,
      );
    }
  });
});
