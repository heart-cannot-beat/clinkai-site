import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import designScreen from '../../design/screens/02-wall.html?raw';
import { pebblesoundWall } from './config';
import { renderWallTiles } from './generate';
import { wallImageUrl } from './images';
import { versionWall } from './index';
import VersionWall from './VersionWall.astro';

async function render(props: { decorative?: boolean } = {}): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(VersionWall, { props });
}

describe('VersionWall 组件：构建时输出静态 HTML', () => {
  it('输出 40 张小图，内容就是生成器的结果', async () => {
    const html = await render();

    expect(html.match(/overflow: hidden; background: /g)).toHaveLength(40);
    expect(html).toContain(renderWallTiles(versionWall));
  });

  it('除了图片地址，和设计稿第 2 屏里的 40 张一字不差', () => {
    const files = [
      ...Object.values(pebblesoundWall.cutouts),
      ...Object.values(pebblesoundWall.photos),
    ].map((image) => image.file);
    let html = renderWallTiles(versionWall);
    for (const file of files) {
      html = html.replaceAll(wallImageUrl(file), `../assets/img/${file}`);
    }

    expect(renderWallTiles(versionWall)).not.toContain('../assets/img/');
    expect(html.split('\n')).toEqual(
      designScreen
        .split('\n')
        .filter((line) => line.includes('overflow: hidden; background: ')),
    );
  });

  it('整面墙是一张图，说明以「示例」开头，和设计稿一致', async () => {
    const html = await render();
    const designLabel = /<div role="img" aria-label="([^"]+)"/.exec(
      designScreen,
    )?.[1];

    expect(designLabel).toMatch(/^示例：/);
    expect(html).toContain(`role="img"`);
    expect(html).toContain(`aria-label="${designLabel}"`);
    expect(html).not.toContain('aria-hidden');
  });

  it('只当背景用时对读屏软件隐藏（第 3 屏的灰墙）', async () => {
    const html = await render({ decorative: true });

    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain('aria-label');
    expect(html.match(/overflow: hidden; background: /g)).toHaveLength(40);
  });

  it('页面里没有脚本：线上不跑任何生成逻辑', async () => {
    expect(await render()).not.toMatch(/<script/i);
  });
});
