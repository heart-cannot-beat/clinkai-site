import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import wallScreen from '../../design/screens/02-wall.html?raw';
import winnerScreen from '../../design/screens/03-winner.html?raw';
import { wallImageUrl } from './images';
import { designScreenTiles } from './test-helpers';
import VersionWall from './VersionWall.astro';

async function render(props: { decorative?: boolean } = {}): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(VersionWall, { props });
}

/** 设计稿某一屏里的小图，图片地址换成站点自己的，拼成组件应该输出的样子 */
function expectedTiles(screen: string): string {
  return designScreenTiles(screen)
    .join('\n')
    .replace(/\.\.\/assets\/img\/([^"]+)/g, (_, file: string) =>
      wallImageUrl(file),
    );
}

/** 组件最外层那个 div 的开标签。母版里的小圆点自己带 aria-hidden，不能拿整段 HTML 来查 */
function wrapperTag(html: string): string {
  return /<div[^>]*class="version-wall[^>]*>/.exec(html)?.[0] ?? '';
}

const TILE = /overflow: hidden; background: /g;
// 胜出的那一张（右下的钴蓝横幅）在设计稿画布上的位置
const WINNER_BOX = 'left: 1162px; top: 545px; width: 316px; height: 165px';

describe('VersionWall 组件：构建时输出静态 HTML', () => {
  it('第 2 屏：40 张小图，除了图片地址，和设计稿一字不差', async () => {
    const html = await render();

    expect(html.match(TILE)).toHaveLength(40);
    expect(html).toContain(expectedTiles(wallScreen));
    expect(html).toContain(WINNER_BOX);
  });

  it('图片地址是站点自己的，不是设计稿里的相对路径', async () => {
    const html = await render();

    expect(html).toContain(wallImageUrl('pebble_trumpet.jpg'));
    expect(html).not.toContain('../assets/');
  });

  it('整面墙是一张图，说明以「示例」开头，和设计稿一致', async () => {
    const wrapper = wrapperTag(await render());
    const designLabel = /<div role="img" aria-label="([^"]+)"/.exec(
      wallScreen,
    )?.[1];

    expect(designLabel).toMatch(/^示例：/);
    expect(wrapper).toContain(`role="img"`);
    expect(wrapper).toContain(`aria-label="${designLabel}"`);
    expect(wrapper).not.toContain('aria-hidden');
  });

  it('只当背景用时对读屏软件隐藏（第 3 屏的灰墙）', async () => {
    const wrapper = wrapperTag(await render({ decorative: true }));

    expect(wrapper).toContain('aria-hidden="true"');
    expect(wrapper).not.toContain('role="img"');
    expect(wrapper).not.toContain('aria-label');
  });

  it('第 3 屏的灰墙：39 张，胜出的那一张不输出，其余和设计稿一字不差', async () => {
    const html = await render({ decorative: true });

    expect(html.match(TILE)).toHaveLength(39);
    expect(html).toContain(expectedTiles(winnerScreen));
    expect(html).not.toContain(WINNER_BOX);
  });

  it('页面里没有脚本：线上不跑任何生成逻辑', async () => {
    expect(await render()).not.toMatch(/<script/i);
    expect(await render({ decorative: true })).not.toMatch(/<script/i);
  });
});
