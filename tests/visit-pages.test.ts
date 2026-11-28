import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { unstable_readConfig } from 'wrangler';
import { beforeAll, describe, expect, it } from 'vitest';
import baseLayoutSource from '../src/layouts/BaseLayout.astro?raw';
import { routePath } from '../src/seo/pages';
import { absoluteUrl } from '../src/seo/site';
import { VISIT_PATH_ATTRIBUTE } from '../src/visit/report';
import {
  cleanPath,
  VISIT_DATASET,
  VISIT_PATH,
} from '../src/worker/visit/schema';

// 访问统计（P-06）接进页面的那一头：每个页面都带着自己的路径，记数接口收得下；
// 配置里有绑定，预览里没有。接口和页面脚本各自的行为在它们旁边的测试里。

type PageComponent = Parameters<AstroContainer['renderToString']>[0];

const pageModules = import.meta.glob<PageComponent>('../src/pages/**/*.astro', {
  import: 'default',
  eager: true,
});

/** src/pages/ 里的文件 → 构建出来的文件名（Astro 的默认规则：目录形式，404 例外） */
function builtFile(source: string): string {
  const name = source.replace('../src/pages/', '').replace(/\.astro$/, '');
  if (name === '404') return '404.html';
  return name === 'index' || name.endsWith('/index')
    ? `${name}.html`
    : `${name}/index.html`;
}

const visitPaths = new Map<string, string | undefined>();

beforeAll(async () => {
  const container = await AstroContainer.create();
  for (const [source, component] of Object.entries(pageModules)) {
    const file = builtFile(source);
    const html = await container.renderToString(component, {
      request: new Request(absoluteUrl(routePath(file))),
    });
    const body = /<body\b[^>]*>/.exec(html)?.[0] ?? '';
    visitPaths.set(
      file,
      new RegExp(`\\s${VISIT_PATH_ATTRIBUTE}="([^"]*)"`).exec(body)?.[1],
    );
  }
}, 60_000);

describe('每个页面都带着自己的路径', () => {
  it('src/pages/ 下的页面都渲染出来了（防止读错路径导致空比空）', () => {
    expect([...visitPaths.keys()]).toEqual(
      expect.arrayContaining([
        'index.html',
        'contact/index.html',
        'privacy/index.html',
        '404.html',
      ]),
    );
  });

  it('写在 <body> 上的路径就是这一页的规范路径', () => {
    for (const [file, path] of visitPaths) {
      expect(path, file).toBe(routePath(file));
    }
    expect(visitPaths.get('index.html')).toBe('/');
    expect(visitPaths.get('contact/index.html')).toBe('/contact/');
  });

  it('404 页的路径是固定的：不管在哪个地址下打开，记的都是 /404/', () => {
    expect(visitPaths.get('404.html')).toBe('/404/');
  });

  it('每个页面的路径，记数接口都收得下', () => {
    for (const [file, path] of visitPaths) {
      expect(cleanPath(path), `${file} 的 ${path}`).toBe(path);
    }
  });

  it('页面脚本是打包进站点的那一段，由 BaseLayout 带上', () => {
    expect(baseLayoutSource).toMatch(
      /<script>[\s\S]*import \{ reportVisit \} from '\.\.\/visit\/report';[\s\S]*reportVisit\(\);[\s\S]*<\/script>/,
    );
    expect(baseLayoutSource).not.toMatch(/<script[^>]+src=/);
  });
});

describe('wrangler.jsonc：访问统计', () => {
  const config = unstable_readConfig({ config: 'wrangler.jsonc' });

  it('绑定名和数据集名与代码里用的一致', () => {
    expect(config.analytics_engine_datasets).toEqual([
      { binding: 'VISITS', dataset: VISIT_DATASET },
    ]);
  });

  it('记数接口在 /api/ 下：只有它和表单接口先进 Worker，页面请求不经过 Worker', () => {
    expect(VISIT_PATH.startsWith('/api/')).toBe(true);
    expect(config.assets?.run_worker_first).toEqual(['/api/*']);
  });

  it('预览不配统计绑定：PR 预览里的访问不记，不会混进正式数据', () => {
    expect(config.previews?.analytics_engine_datasets ?? []).toEqual([]);
  });
});
