import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import manifest from '../design/assets/manifest.json';
import CreatorsScreen from '../src/home/CreatorsScreen.astro';
import EndingScreen from '../src/home/EndingScreen.astro';
import HeroScreen from '../src/home/HeroScreen.astro';
import LayersScreen from '../src/home/LayersScreen.astro';
import NextRoundScreen from '../src/home/NextRoundScreen.astro';
import WallScreen from '../src/home/WallScreen.astro';
import WinnerScreen from '../src/home/WinnerScreen.astro';
import { NEXT_ROUND_TILES, renderNextRoundTiles } from '../src/home/next-round';
import IndexPage from '../src/pages/index.astro';
import { versionWall } from '../src/wall';
import { designScreenTiles } from '../src/wall/test-helpers';

// 首页静态版（P-01）：每一屏就是 design/screens/ 里对应文件的那一帧。
// 这里把站点渲染出来的每一屏和设计稿的 HTML 源对照：文字、无障碍说明、用到的图片和视频。
// 位置、颜色、字号这些样式上的对照靠截图（PR 里附图；进 CI 的截图对比是 P-07）。

const designScreens = import.meta.glob<string>('../design/screens/0*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const SCREENS = [
  { name: '01-hero', component: HeroScreen },
  { name: '02-wall', component: WallScreen },
  { name: '03-winner', component: WinnerScreen },
  { name: '03b-next-round', component: NextRoundScreen },
  { name: '04-creators', component: CreatorsScreen },
  { name: '05-layers', component: LayersScreen },
  { name: '06-ending', component: EndingScreen },
] as const;

type ScreenName = (typeof SCREENS)[number]['name'];
const NAMES = SCREENS.map((screen) => screen.name);

/** 设计稿某一屏 <body> 里的内容 */
function designFrame(name: ScreenName): string {
  const html = designScreens[`../design/screens/${name}.html`];
  if (!html) throw new Error(`设计稿里没有 ${name}.html`);
  return html.slice(html.indexOf('<body>') + '<body>'.length);
}

function decode(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#34;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

/** 读得到的文字，按出现的顺序，一段一项 */
function textRuns(html: string): string[] {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '')
    .split(/<[^>]+>/)
    .map((run) => decode(run).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** 无障碍说明：aria-label 和不为空的 alt，按出现的顺序 */
function descriptions(html: string): string[] {
  return [...html.matchAll(/\s(?:aria-label|alt)="([^"]+)"/g)].map((match) =>
    decode(match[1]!),
  );
}

/** <img> 和 <source> 用到的文件名，按出现的顺序 */
function mediaFiles(html: string): string[] {
  return [...html.matchAll(/<(?:img|source)\b[^>]*?\ssrc="([^"]+)"/g)].map(
    (match) => decode(match[1]!).split('/').pop()!.split('?')[0]!,
  );
}

let container: AstroContainer;
const rendered = new Map<ScreenName, string>();
let page = '';

beforeAll(async () => {
  container = await AstroContainer.create();
  for (const screen of SCREENS) {
    rendered.set(screen.name, await container.renderToString(screen.component));
  }
  page = await container.renderToString(IndexPage);
});

const site = (name: ScreenName) => rendered.get(name)!;

describe('首页：每一屏照抄设计稿', () => {
  it('交接包里有这 7 个文件（防止读错路径导致空比空）', () => {
    for (const name of NAMES) {
      expect(textRuns(designFrame(name)).length, name).toBeGreaterThan(10);
    }
  });

  it.each(NAMES)('%s：读得到的文字一字不差，顺序也一样', (name) => {
    expect(textRuns(site(name))).toEqual(textRuns(designFrame(name)));
  });

  it.each(NAMES)('%s：无障碍说明和设计稿一致', (name) => {
    expect(descriptions(site(name))).toEqual(descriptions(designFrame(name)));
  });

  it.each(NAMES)('%s：用到的图片和视频与设计稿一致，顺序也一样', (name) => {
    expect(mediaFiles(site(name))).toEqual(mediaFiles(designFrame(name)));
  });

  it('图片和视频的地址是站点自己的，不指向交接包', () => {
    expect(page).not.toContain('../assets/');
    expect(page).not.toContain('design/');
  });
});

describe('首页：屏的顺序和结构', () => {
  it('中文文档骨架', () => {
    expect(page).toContain('<html lang="zh-CN">');
    expect(page).toContain('<title>ClinkAI</title>');
  });

  it('6 屏按顺序排，第 3 屏的两拍上下排开', () => {
    const order = [...page.matchAll(/data-screen="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(order).toEqual(NAMES);
  });

  it('只有一个一级标题，在首屏', () => {
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(site('01-hero')).toMatch(/<h1\b/);
  });

  it('只有首屏的页头是真页头，其余几屏的对读屏软件隐藏、不进 Tab 顺序', () => {
    const headers = page.match(/<header\b[^>]*>/g) ?? [];
    const hidden = headers.filter((tag) => tag.includes('aria-hidden="true"'));

    expect(headers).toHaveLength(7);
    expect(hidden).toHaveLength(6);
    expect(site('01-hero')).not.toMatch(/<header\b[^>]*aria-hidden/);
    expect(site('01-hero')).not.toContain('tabindex');

    for (const name of NAMES.slice(1)) {
      const header = /<header\b[\s\S]*?<\/header>/.exec(site(name))?.[0] ?? '';
      const links = header.match(/<a\b[^>]*>/g) ?? [];

      expect(links, name).toHaveLength(6);
      for (const link of links) expect(link, name).toContain('tabindex="-1"');
    }
  });

  it('菜单按钮照设计稿：结尾屏没有，其余每屏一个，只有首屏的进 Tab 顺序', () => {
    const buttons = page.match(/<button\b[^>]*>/g) ?? [];

    expect(buttons).toHaveLength(6);
    expect(buttons.filter((tag) => tag.includes('tabindex="-1"'))).toHaveLength(
      5,
    );
    expect(site('06-ending')).not.toMatch(/<button\b/);
  });

  it('画布的缩放比例在 <head> 里用内联脚本算，不引外部脚本', () => {
    const head = page.slice(0, page.indexOf('</head>'));

    expect(head).toMatch(/<script>[\s\S]*--home-scale[\s\S]*<\/script>/);
    expect(page).not.toMatch(/<script[^>]+src=["']https?:/i);
  });
});

describe('首页：数量从数据里数，不手写', () => {
  const { versions, languages, sizes } = versionWall.counts;

  it('第 2 屏：版本数、语言数、尺寸数读版本墙的计数', () => {
    const runs = textRuns(site('02-wall'));

    expect(runs).toContain(String(versions));
    expect(runs).toContain(`${languages} 种语言 · ${sizes} 种尺寸 · 示例`);
  });

  it('第 3 屏第 1 拍：胜出的张数和总版本数读版本墙的数据', () => {
    const winners = versionWall.tiles.filter((tile) => tile.winner).length;
    const runs = textRuns(site('03-winner'));

    expect(winners).toBe(1);
    expect(runs).toContain(String(winners));
    expect(runs).toContain(`个胜出，${versions} 个版本里测出来的`);
    expect(site('03-winner')).toContain(`${versions} 个版本里胜出的那一版`);
  });

  it('第 3 屏第 2 拍：新版本的个数是小图的张数', () => {
    const count = NEXT_ROUND_TILES.length;
    const html = site('03b-next-round');

    expect(html.match(/overflow: hidden; background: /g)).toHaveLength(count);
    expect(textRuns(html)).toContain(String(count));
    expect(textRuns(html)).toContain(
      `第 2 轮 · 同一个主张，${count} 种新讲法 · 示例`,
    );
  });
});

describe('第 3 屏第 2 拍的新版本小图', () => {
  it('除了图片地址，和设计稿一字不差', () => {
    const design = designScreenTiles(designFrame('03b-next-round'));

    expect(design).toHaveLength(8);
    expect(
      renderNextRoundTiles(
        NEXT_ROUND_TILES,
        (file) => `../assets/img/${file}`,
      ).split('\n'),
    ).toEqual(design);
  });
});

describe('首页：素材和文案的规则', () => {
  const assets = new Map(
    manifest.assets.map((asset) => [asset.file.split('/').pop()!, asset]),
  );
  const AD_SCREENS: ScreenName[] = ['02-wall', '03-winner', '03b-next-round'];

  it.each(NAMES)('%s：每个素材都在图片清单里登记了用在这一屏', (name) => {
    for (const file of new Set(mediaFiles(site(name)))) {
      expect(assets.get(file)?.usedIn, `${name} 的 ${file}`).toContain(name);
    }
  });

  it.each(AD_SCREENS)('%s（广告屏）只用广告图片和产品图', (name) => {
    for (const file of new Set(mediaFiles(site(name)))) {
      expect(['ad-image', 'product-cutout'], `${name} 的 ${file}`).toContain(
        assets.get(file)?.kind,
      );
    }
  });

  it('达人视频只出现在达人屏', () => {
    for (const name of NAMES) {
      const videos = mediaFiles(site(name)).filter(
        (file) => assets.get(file)?.kind === 'creator-video',
      );

      expect(videos, name).toHaveLength(name === '04-creators' ? 2 : 0);
      if (name !== '04-creators') expect(site(name)).not.toMatch(/<video\b/);
    }
  });

  // 首屏叠板上也有虚构品牌的内容，但设计稿这一帧没有「示例」标注；已在 Issue #12 里报给设计侧
  it.each([...AD_SCREENS, '04-creators'] as const)(
    '%s：虚构品牌内容旁边标了「示例」',
    (name) => {
      expect(textRuns(site(name)).join(' ')).toContain('示例');
    },
  );

  it('不出现不能写的话', () => {
    const text = textRuns(page).join(' ');

    for (const word of ['飞轮', '越用越准', '品类经验库', '复盘']) {
      expect(text).not.toContain(word);
    }
  });
});

describe('04 屏中间的视频', () => {
  const video = () =>
    /<video\b[^>]*>[\s\S]*?<\/video>/.exec(site('04-creators'))?.[0] ?? '';
  const openTag = () => /<video\b[^>]*>/.exec(video())?.[0] ?? '';

  it('静音、循环、内联播放，不显示控制条', () => {
    expect(openTag()).toMatch(/\smuted\b/);
    expect(openTag()).toMatch(/\sloop\b/);
    expect(openTag()).toMatch(/\splaysinline\b/);
    expect(openTag()).not.toMatch(/\scontrols\b/);
  });

  it('进入视口前不加载，也不靠 autoplay 属性自己播', () => {
    expect(openTag()).toContain('preload="none"');
    expect(openTag()).not.toMatch(/\sautoplay\b/);
  });

  it('webm 在前、mp4 在后，两个都带', () => {
    const sources = [...video().matchAll(/<source\b[^>]*>/g)].map(
      (match) => match[0],
    );

    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatch(/creator-pebble\.webm"[^>]*type="video\/webm"/);
    expect(sources[1]).toMatch(/creator-pebble\.mp4"[^>]*type="video\/mp4"/);
  });

  it('下面垫着同样大小的封面图：视频不显示时看到的就是它', () => {
    const html = site('04-creators');
    const cover = html.indexOf('ugc_pebble.jpg');

    expect(cover).toBeGreaterThan(-1);
    expect(cover).toBeLessThan(html.indexOf('<video'));
    expect(html).toMatch(/<img[^>]*class="cover"[^>]*alt="示例达人视频的封面/);
  });
});
