import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import manifest from '../design/assets/manifest.json';
import AboutFacts from '../src/about/AboutFacts.astro';
import AboutScreen from '../src/about/AboutScreen.astro';
import { ABOUT_FACT_LABELS, ABOUT_FACTS } from '../src/data/about';
import { CONTACT_CTA, NAV_ITEMS } from '../src/data/site';
import { exampleImageFiles } from '../src/media/catalog';
import { preparePicture } from '../src/media/picture';
import AboutPage from '../src/pages/about.astro';
import ProductsPage from '../src/pages/products.astro';
import ProductsAdsScreen from '../src/products/ProductsAdsScreen.astro';
import ProductsCreatorsScreen from '../src/products/ProductsCreatorsScreen.astro';
import ProductsIntroScreen from '../src/products/ProductsIntroScreen.astro';

// 子页面「我们的产品」「关于我们」的静态版（P-03）：每一屏就是 design/screens/ 里对应文件的那一帧。
// 这里把站点渲染出来的每一屏和设计稿的 HTML 源对照：文字、无障碍说明、用到的图片，
// 以及广告那一圈和星图里每个东西的位置、大小、明暗。
// 字号、颜色这些样式上的对照靠截图（PR 里附图；进 CI 的截图对比是 P-07）。

const designScreens = import.meta.glob<string>(
  '../design/screens/page-*.html',
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);

const SCREENS = [
  { name: 'page-products', component: ProductsIntroScreen },
  { name: 'page-products-ads', component: ProductsAdsScreen },
  { name: 'page-products-creators', component: ProductsCreatorsScreen },
  { name: 'page-about', component: AboutScreen },
] as const;

type ScreenName = (typeof SCREENS)[number]['name'];
const NAMES = SCREENS.map((screen) => screen.name);
const PRODUCT_SCREENS = NAMES.slice(0, 3);

/** 设计稿某一屏 <body> 里的内容 */
function designFrame(name: ScreenName): string {
  const html = designScreens[`../design/screens/${name}.html`];
  if (!html) throw new Error(`设计稿里没有 ${name}.html`);
  return html.slice(html.indexOf('<body>') + '<body>'.length);
}

// 关于我们底部四项事实是【待填】：没补齐之前站点上整块不渲染，对照时先把设计稿里的这一块拿掉
const FACTS_BLOCK = /<dl\b[\s\S]*?<\/dl>/;

/** 设计稿里站点现在应该渲染出来的部分 */
function expectedFrame(name: ScreenName): string {
  const frame = designFrame(name);
  return name === 'page-about' ? frame.replace(FACTS_BLOCK, '') : frame;
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

// 站点上的图走图片管线（src/media/），地址不再是原来的文件名：用管线把地址反查回文件名
const fileBySrc = new Map<string, string>();

/** <img> 用到的文件名，按出现的顺序 */
function imageFiles(html: string): string[] {
  return [...html.matchAll(/<img\b[^>]*?\ssrc="([^"]+)"/g)].map((match) => {
    const src = decode(match[1]!);
    return fileBySrc.get(src) ?? src.split('/').pop()!.split('?')[0]!;
  });
}

/** 页面上的每张图：<img> 标签，和包着它的 <picture>（没有就是空的） */
function images(html: string): { img: string; picture: string }[] {
  const found: { img: string; picture: string }[] = [];
  const rest = html.replace(
    /<picture\b[^>]*>[\s\S]*?<\/picture>/g,
    (picture) => {
      found.push({ img: /<img\b[^>]*>/.exec(picture)?.[0] ?? '', picture });
      return '';
    },
  );
  for (const match of rest.matchAll(/<img\b[^>]*>/g)) {
    found.push({ img: match[0], picture: '' });
  }
  return found;
}

/** 标签上某个属性的值 */
const attribute = (tag: string, name: string): string | undefined => {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : decode(value);
};

/** 内联样式里某一项的值，例如 style(tag, 'left') → '39px' */
const style = (tag: string, property: string): string | undefined =>
  new RegExp(`(?:^|;\\s*)${property}:\\s*([^;]+)`).exec(
    attribute(tag, 'style') ?? '',
  )?.[1];

/** 内联样式里一个像素值 */
const px = (tag: string, property: string): number | undefined => {
  const value = style(tag, property);
  return value === undefined ? undefined : Number(value.replace('px', ''));
};

const numbers = (value: string): number[] =>
  (value.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

let container: AstroContainer;
const rendered = new Map<ScreenName, string>();
let productsPage = '';
let aboutPage = '';

beforeAll(async () => {
  for (const file of exampleImageFiles) {
    fileBySrc.set((await preparePicture(file)).src, file);
  }
  container = await AstroContainer.create();
  for (const screen of SCREENS) {
    rendered.set(screen.name, await container.renderToString(screen.component));
  }
  productsPage = await container.renderToString(ProductsPage);
  aboutPage = await container.renderToString(AboutPage);
});

const site = (name: ScreenName) => rendered.get(name)!;

describe('子页面：每一屏照抄设计稿', () => {
  it('交接包里有这 4 个文件（防止读错路径导致空比空）', () => {
    for (const name of NAMES) {
      expect(textRuns(designFrame(name)).length, name).toBeGreaterThan(10);
    }
  });

  it.each(NAMES)('%s：读得到的文字一字不差，顺序也一样', (name) => {
    expect(textRuns(site(name))).toEqual(textRuns(expectedFrame(name)));
  });

  it.each(NAMES)('%s：无障碍说明和设计稿一致', (name) => {
    expect(descriptions(site(name))).toEqual(descriptions(expectedFrame(name)));
  });

  it.each(NAMES)('%s：用到的图片与设计稿一致，顺序也一样', (name) => {
    expect(imageFiles(site(name))).toEqual(imageFiles(expectedFrame(name)));
  });

  it('图片的地址是站点自己的，不指向交接包', () => {
    for (const page of [productsPage, aboutPage]) {
      expect(page).not.toContain('../assets/');
      expect(page).not.toContain('design/');
    }
  });
});

describe('我们的产品：一页三屏', () => {
  it('页面标题照设计稿，三屏按顺序排', () => {
    const order = [...productsPage.matchAll(/data-screen="([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(productsPage).toContain('<html lang="zh-CN">');
    expect(productsPage).toContain('<title>ClinkAI 我们的产品</title>');
    expect(order).toEqual(PRODUCT_SCREENS);
  });

  it('页面的描述是第 1 屏大标题下面的那一句', () => {
    expect(productsPage).toMatch(
      /<meta[^>]*name="description"[^>]*content="我们团队每天跑项目用的两个工具。"/,
    );
  });

  it('只有一个一级标题，在第 1 屏；英文大标题标成英文，句号是装饰', () => {
    const heading =
      /<h1[^>]*lang="en"[\s\S]*?<\/h1>/.exec(site('page-products'))?.[0] ?? '';

    expect(productsPage.match(/<h1\b/g)).toHaveLength(1);
    expect(textRuns(heading)).toEqual(['OUR OWN', 'TOOLS']);
    expect(heading).toMatch(
      /<span[^>]*class="period[^"]*"[^>]*aria-hidden="true"/,
    );
  });

  it('第 1 屏的两行产品名跳到本页的第 2 屏和第 3 屏', () => {
    const links = [
      ...site('page-products').matchAll(
        /<h2\b[^>]*>\s*<a\b[^>]*href="([^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/g,
      ),
    ].map((match) => [match[1], match[2]]);

    expect(links).toEqual([
      ['#ads', 'ClinkAI Ads'],
      ['#creators', 'ClinkAI Creators'],
    ]);

    // 锚点正好在对应那一屏的前面
    const position = (needle: string) => productsPage.indexOf(needle);
    expect(position('id="ads"')).toBeGreaterThan(
      position('data-screen="page-products"'),
    );
    expect(position('id="ads"')).toBeLessThan(
      position('data-screen="page-products-ads"'),
    );
    expect(position('id="creators"')).toBeGreaterThan(
      position('data-screen="page-products-ads"'),
    );
    expect(position('id="creators"')).toBeLessThan(
      position('data-screen="page-products-creators"'),
    );
    expect(productsPage.match(/\sid="(?:ads|creators)"/g)).toHaveLength(2);
  });

  it('只有第 1 屏的页头是真页头，下面两屏的对读屏软件隐藏、不进 Tab 顺序；都标着「我们的产品」', () => {
    const headers = productsPage.match(/<header\b[^>]*>/g) ?? [];

    expect(headers).toHaveLength(3);
    expect(
      headers.filter((tag) => tag.includes('aria-hidden="true"')),
    ).toHaveLength(2);
    expect(site('page-products')).not.toMatch(/<header\b[^>]*aria-hidden/);

    for (const name of PRODUCT_SCREENS) {
      const header = /<header\b[\s\S]*?<\/header>/.exec(site(name))?.[0] ?? '';
      const links = header.match(/<a\b[^>]*>/g) ?? [];

      expect(header.match(/aria-current="page"/g), name).toHaveLength(1);
      expect(header, name).toMatch(/aria-current="page"[^>]*>\s*我们的产品 ↗/);
      expect(links, name).toHaveLength(6);
      for (const link of links) {
        expect(link.includes('tabindex="-1"'), name).toBe(
          name !== 'page-products',
        );
      }
    }
  });

  it('深色的两屏用纸色的页头和角落部件', () => {
    for (const name of [
      'page-products-ads',
      'page-products-creators',
    ] as const) {
      expect(site(name), name).toMatch(/class="[^"]*\bbg-ink\b/);
      expect(site(name), name).toMatch(/class="[^"]*\bplain\b[^"]*\bpaper\b/);
      expect(site(name), name).toMatch(/class="sound-dot paper/);
    }
  });

  it('角落部件照设计稿：SCROLL 只在第 1 屏，菜单按钮每屏一个、只有第 1 屏的进 Tab 顺序', () => {
    const buttons = productsPage.match(/<button\b[^>]*>/g) ?? [];

    expect(buttons).toHaveLength(3);
    expect(buttons.filter((tag) => tag.includes('tabindex="-1"'))).toHaveLength(
      2,
    );
    expect(textRuns(site('page-products'))).toContain('SCROLL ↓');
    expect(productsPage.match(/SCROLL/g)).toHaveLength(1);
  });

  it('「预约演示」在下面两屏各一个，去预约沟通页', () => {
    for (const name of [
      'page-products-ads',
      'page-products-creators',
    ] as const) {
      expect(site(name), name).toMatch(
        new RegExp(
          `<a[^>]*class="demo-button[^"]*"[^>]*href="${CONTACT_CTA.href}"[^>]*>\\s*预约演示`,
        ),
      );
    }
    expect(site('page-products')).not.toContain('预约演示');
  });

  it('画布的缩放比例在 <head> 里用内联脚本算，不引外部脚本', () => {
    for (const page of [productsPage, aboutPage]) {
      const head = page.slice(0, page.indexOf('</head>'));

      expect(head).toMatch(/<script>[\s\S]*--home-scale[\s\S]*<\/script>/);
      expect(page).not.toMatch(/<script[^>]+src=["']https?:/i);
    }
  });
});

describe('我们的产品 · 第 2 屏：七个产品站成一圈', () => {
  const ringOf = (html: string) =>
    html.slice(html.indexOf('role="img"'), html.indexOf('01 / ClinkAI Ads'));

  /** 一张卡片：外框的位置、大小、角度、明暗，底色和字色，里面按多大排版、缩放多少 */
  interface Card {
    box: (number | undefined)[];
    rotate: string | undefined;
    filter: string | undefined;
    tone: string;
    inkText: boolean;
    front: boolean;
    art: (number | undefined)[];
    scale: string | undefined;
  }

  const TONES: Record<string, string> = {
    '#2A2A28': 'dark',
    '#F3EEE2': 'cream',
    '#E8542F': 'orange',
  };

  const box = (tag: string) => [
    px(tag, 'left'),
    px(tag, 'top'),
    px(tag, 'width'),
    px(tag, 'height'),
  ];

  // 设计稿：卡片是带 overflow: hidden 的外框，里面紧跟一层按原尺寸排版再缩放的
  function designCards(): Card[] {
    return [
      ...ringOf(designFrame('page-products-ads')).matchAll(
        /(<div style="[^"]*overflow: hidden[^"]*">)(<div style="[^"]*">)/g,
      ),
    ].map(([, frame = '', art = '']) => ({
      box: box(frame),
      rotate: style(frame, 'transform'),
      filter: style(frame, 'filter'),
      tone: TONES[style(frame, 'background') ?? ''] ?? '?',
      inkText: style(frame, 'color') === '#1C1C1B',
      front: style(frame, 'box-shadow') !== undefined,
      art: [px(art, 'width'), px(art, 'height')],
      scale: style(art, 'transform'),
    }));
  }

  function siteCards(): Card[] {
    return [
      ...ringOf(site('page-products-ads')).matchAll(
        /(<div\b[^>]*class="ring-card[^>]*>)\s*(<div\b[^>]*class="art[^>]*>)/g,
      ),
    ].map(([, frame = '', art = '']) => {
      const classes = (attribute(frame, 'class') ?? '').split(/\s+/);
      return {
        box: box(frame),
        rotate: style(frame, 'transform'),
        filter: style(frame, 'filter'),
        tone:
          classes.find((name) => Object.values(TONES).includes(name)) ?? '?',
        inkText: classes.includes('ink-text'),
        front: classes.includes('front'),
        art: [px(art, 'width'), px(art, 'height')],
        scale: style(art, 'transform'),
      };
    });
  }

  it('整圈是一个带说明的 role="img"，里面的图 alt 都留空', () => {
    const html = site('page-products-ads');
    const label =
      /<div[^>]*role="img"[^>]*aria-label="([^"]+)"/.exec(html)?.[1] ?? '';

    expect(html.match(/role="img"/g)).toHaveLength(1);
    expect(label).toMatch(/^示例：七个不同产品的广告。/);
    for (const { img } of images(ringOf(html))) {
      expect(img).toMatch(/\salt(?:=""|[\s>])/);
    }
    // 整屏的图都在这一圈里
    expect(images(ringOf(html))).toHaveLength(images(html).length);
  });

  it('19 张卡片的位置、大小、角度、明暗、底色和缩放都和设计稿一样，叠放的顺序也一样', () => {
    const design = designCards();

    expect(design).toHaveLength(19);
    expect(design.filter((card) => card.front)).toHaveLength(7);
    expect(siteCards()).toEqual(design);
  });

  it('抠图在卡片里的位置和大小和设计稿一样', () => {
    const cutouts = (html: string) =>
      images(ringOf(html))
        .map(({ img }) => img)
        .filter(
          (img) => style(img, 'max-width') || px(img, 'left') !== undefined,
        )
        .map((img) => [
          imageFiles(img)[0],
          ...box(img),
          style(img, 'transform'),
        ]);

    const design = cutouts(designFrame('page-products-ads'));

    expect(design.map(([file]) => file)).toEqual([
      'dawn_cut_bag.webp',
      'halfmile_cut_shoe.webp',
    ]);
    expect(cutouts(site('page-products-ads'))).toEqual(design);
  });

  it('「胜出」小标签一共 7 处，位置和大小档位和设计稿一样', () => {
    // 字号对应远近：正中间 14px，往两边依次 12、10、9
    const DEPTH_BY_FONT: Record<string, string> = {
      '14px': 'depth-0',
      '12px': 'depth-1',
      '10px': 'depth-2',
      '9px': 'depth-3',
    };
    const design = [
      ...designFrame('page-products-ads').matchAll(
        /<span style="[^"]*border-radius: 999px[^"]*">(?=<span[^>]*><\/span>胜出)/g,
      ),
    ].map(([tag]) => [
      px(tag, 'left'),
      px(tag, 'top'),
      DEPTH_BY_FONT[style(tag, 'font-size') ?? ''],
    ]);
    const ours = [
      ...site('page-products-ads').matchAll(
        /<span\b[^>]*class="tag depth-\d[^>]*>/g,
      ),
    ].map(([tag]) => [
      px(tag, 'left'),
      px(tag, 'top'),
      /depth-\d/.exec(tag)?.[0],
    ]);

    expect(design).toHaveLength(7);
    expect(ours).toEqual(design);
    expect(
      textRuns(site('page-products-ads')).filter((run) => run === '胜出'),
    ).toHaveLength(7);
  });

  it('这一屏不放结果数字：除了编号和「7 个虚构品牌」，没有别的数字', () => {
    const text = textRuns(site('page-products-ads'))
      .join(' ')
      .replace('01 / ClinkAI Ads', '')
      .replace('7 个虚构品牌', '');

    expect(text).not.toMatch(/\d/);
  });
});

describe('我们的产品 · 第 3 屏：星图', () => {
  const STAR_MAP = /<svg\b[^>]*viewBox="0 0 1440 900"[\s\S]*?<\/svg>/;

  const PAPER = /rgba\(230,228,223,([\d.]+)\)/;

  /**
   * SVG 里的一个图形：是什么、在哪、多不透明、长什么样。
   * 设计稿把颜色直接写在属性里；站点用 class 上色（取设计规范的变量），不透明度写在属性里。
   */
  function shapes(svg: string) {
    return [...svg.matchAll(/<(path|circle|ellipse)\b[^>]*>/g)].map(
      ([tag, kind = '']) => {
        const geometry =
          kind === 'path'
            ? (attribute(tag, 'd') ?? '')
            : ['cx', 'cy', 'r', 'rx', 'ry', 'transform']
                .map((name) => attribute(tag, name) ?? '')
                .join(' ');
        const fill = attribute(tag, 'fill') ?? '';
        const stroke = attribute(tag, 'stroke') ?? '';
        const className = attribute(tag, 'class')?.split(/\s+/)[0];

        let look = className;
        let alpha: number | null;
        if (className !== undefined) {
          const opacity =
            attribute(tag, 'stroke-opacity') ?? attribute(tag, 'fill-opacity');
          alpha = opacity === undefined ? null : Number(opacity);
        } else {
          if (kind === 'circle') {
            look =
              fill === '#E6E4DF'
                ? 'brand-dot'
                : fill === '#1C1C1B'
                  ? 'hollow'
                  : 'dot';
          } else {
            look = attribute(tag, 'stroke-width') === '1.5' ? 'link' : 'line';
          }
          const match = PAPER.exec(stroke) ?? PAPER.exec(fill);
          alpha = match ? Number(match[1]) : null;
        }

        return {
          kind,
          geometry: numbers(geometry),
          alpha,
          look,
          dash: attribute(tag, 'stroke-dasharray') ?? '',
          cap: attribute(tag, 'stroke-linecap') ?? '',
        };
      },
    );
  }

  it('星空、轨道、连线和每一颗星都和设计稿一样：位置、大小、明暗、线型、先后顺序', () => {
    const design = shapes(
      STAR_MAP.exec(designFrame('page-products-creators'))?.[0] ?? '',
    );
    const ours = shapes(
      STAR_MAP.exec(site('page-products-creators'))?.[0] ?? '',
    );

    expect(design).toHaveLength(225);
    expect(design.filter((shape) => shape.kind === 'ellipse')).toHaveLength(4);
    expect(design.filter((shape) => shape.look === 'link')).toHaveLength(4);
    expect(ours).toEqual(design);
  });

  it('状态和连线一一对应：已确认是实线，待确认是虚线，未知是点线', () => {
    const html = site('page-products-creators');
    const links = shapes(STAR_MAP.exec(html)?.[0] ?? '').filter(
      (shape) => shape.look === 'link',
    );
    const statuses = [...html.matchAll(/class="status-tag (\w+)/g)].map(
      (match) => match[1],
    );
    const LINE: Record<string, string> = {
      ok: '',
      wait: '7 7',
      unknown: '1.5 8',
    };

    expect(statuses).toEqual(['ok', 'ok', 'wait', 'unknown']);
    expect(links.map((link) => link.dash)).toEqual(
      statuses.map((status) => LINE[status ?? '']),
    );
  });

  it('四步的名字写在各自轨道上，位置和设计稿一样', () => {
    const names = (html: string) =>
      [
        ...html.matchAll(
          /<span\b[^>]*style="[^"]*right: \d+px[^"]*"[^>]*>\s*([^<]+?)\s*<\/span>/g,
        ),
      ].map(([tag, name]) => [name, px(tag, 'right'), px(tag, 'top')]);
    const design = names(designFrame('page-products-creators'));

    expect(design.map(([name]) => name)).toEqual([
      '找达人',
      '发邀约',
      '跟进确认',
      '收作品',
    ]);
    expect(names(site('page-products-creators'))).toEqual(design);
  });

  /** 一位达人：头像的位置和大小、文字的位置和字号、读得到的三段文字、状态 */
  function creators(html: string) {
    const STATUS_BY_COLOR: Record<string, string> = {
      '#7FD39A': 'ok',
      '#E6B450': 'wait',
      'rgba(230,228,223,0.55)': 'unknown',
    };
    return [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(
      ([, item = '']) => {
        const img = /<img\b[^>]*>/.exec(item)?.[0] ?? '';
        const text = /<p\b[^>]*>/.exec(item)?.[0] ?? '';
        const handle = /<span\b[^>]*lang="en"[^>]*>/.exec(item)?.[0] ?? '';
        const dot =
          /<span\b[^>]*aria-hidden="true"[^>]*>/.exec(item)?.[0] ?? '';
        const status =
          /class="status-tag (\w+)/.exec(item)?.[1] ??
          STATUS_BY_COLOR[(style(dot, 'background') ?? '').replaceAll(' ', '')];
        return {
          file: imageFiles(img)[0],
          alt: attribute(img, 'alt') ?? '',
          avatar: [
            px(img, 'left'),
            px(img, 'top'),
            px(img, 'width'),
            px(img, 'height'),
          ],
          text: [px(text, 'left'), px(text, 'right'), px(text, 'top')],
          handleSize: px(handle, 'font-size'),
          runs: textRuns(item),
          status,
        };
      },
    );
  }

  it('四位达人的头像、账号名、状态和位置都和设计稿一样', () => {
    const design = creators(designFrame('page-products-creators'));

    expect(design.map((creator) => creator.runs[0])).toEqual([
      '@slowmornings.co',
      '@kenji.runs',
      '@noor.on.the.go',
      '@trailvolt',
    ]);
    expect(design.map((creator) => creator.status)).toEqual([
      'ok',
      'ok',
      'wait',
      'unknown',
    ]);
    expect(creators(site('page-products-creators'))).toEqual(design);
  });

  it('星空和轨道是一个带说明的 role="img"；达人列表在它外面，账号名和状态读屏读得到', () => {
    const html = site('page-products-creators');
    const open = /<div[^>]*role="img"[^>]*>/.exec(html)?.[0] ?? '';
    const start = html.indexOf(open);
    const list = html.indexOf('<ul');

    expect(html.match(/role="img"/g)).toHaveLength(1);
    expect(attribute(open, 'aria-label')).toBe(
      '示例：一个品牌和四位达人的建联进度，离品牌越近，合作走得越远',
    );
    // 整张 SVG 和四步的名字都在 role="img" 里面，列表在它后面
    expect(html.indexOf('<svg')).toBeGreaterThan(start);
    expect(html.indexOf('收作品')).toBeGreaterThan(start);
    expect(html.indexOf('收作品')).toBeLessThan(list);
    expect(html.slice(start, list).match(/<div\b/g)).toHaveLength(
      html.slice(start, list).match(/<\/div>/g)?.length ?? -1,
    );

    const items = html.slice(list, html.indexOf('</ul>'));
    expect(items).not.toMatch(/aria-hidden="true"[^>]*>[^<]*@/);
    for (const creator of creators(items)) {
      expect(creator.alt).toBe('');
      expect(creator.runs).toHaveLength(3);
      expect(creator.runs[1]).toMatch(/状态：$/);
    }
  });

  it('轨道上没写名字的小点不带数字或文字', () => {
    const svg = STAR_MAP.exec(site('page-products-creators'))?.[0] ?? '';

    expect(textRuns(svg)).toEqual([]);
    expect(svg).not.toMatch(/<(text|title|desc)\b/);
  });
});

describe('关于我们', () => {
  it('页面标题照设计稿，只有一屏', () => {
    expect(aboutPage).toContain('<html lang="zh-CN">');
    expect(aboutPage).toContain('<title>ClinkAI 关于我们</title>');
    expect(aboutPage.match(/data-screen="[^"]+"/g)).toEqual([
      'data-screen="page-about"',
    ]);
  });

  it('页面的描述是大标题下面的介绍', () => {
    const description =
      /<meta[^>]*name="description"[^>]*content="([^"]+)"/.exec(
        aboutPage,
      )?.[1] ?? '';

    expect(description).toMatch(/^一支帮中国品牌出海的增长团队。/);
    expect(textRuns(site('page-about'))).toContain(description);
  });

  it('只有一个一级标题；英文大标题标成英文，句号是装饰', () => {
    const heading =
      /<h1[^>]*lang="en"[\s\S]*?<\/h1>/.exec(aboutPage)?.[0] ?? '';

    expect(aboutPage.match(/<h1\b/g)).toHaveLength(1);
    expect(textRuns(heading)).toEqual(['WHO', 'WE ARE']);
    expect(heading).toMatch(
      /<span[^>]*class="period[^"]*"[^>]*aria-hidden="true"/,
    );
  });

  it('普通页头，「关于我们」标成当前页，链接都在 Tab 顺序里', () => {
    const header = /<header\b[\s\S]*?<\/header>/.exec(aboutPage)?.[0] ?? '';

    expect(aboutPage.match(/<header\b/g)).toHaveLength(1);
    expect(header).toMatch(
      /class="[^"]*\bsite-header\b[^"]*\bplain\b[^"]*\bink\b/,
    );
    expect(header.match(/aria-current="page"/g)).toHaveLength(1);
    expect(header).toMatch(/aria-current="page"[^>]*>\s*关于我们 ↗/);
    expect(header).not.toContain('tabindex');
    expect(header).not.toMatch(/<header\b[^>]*aria-hidden/);
  });

  it('右边六行清单，编号从 01 到 06', () => {
    const list =
      /<ul[^>]*aria-label="我们做的六件事"[\s\S]*?<\/ul>/.exec(
        aboutPage,
      )?.[0] ?? '';
    const rows = [...list.matchAll(/<li\b[\s\S]*?<\/li>/g)].map(([row]) =>
      textRuns(row),
    );

    expect(rows.map(([no, name]) => `${no} ${name}`)).toEqual([
      '01 策略',
      '02 品牌',
      '03 广告',
      '04 达人',
      '05 内容',
      '06 结论',
    ]);
    for (const row of rows) expect(row).toHaveLength(3);
  });

  it('角落部件：有圆点和菜单按钮，没有 SCROLL；这一页没有图', () => {
    expect(aboutPage).toContain('sound-dot');
    expect(
      aboutPage.match(/<button\b[^>]*aria-label="打开菜单"/g),
    ).toHaveLength(1);
    expect(aboutPage).not.toContain('SCROLL');
    expect(aboutPage).not.toMatch(/<img\b/);
  });
});

describe('【待填】：关于我们底部的四项事实', () => {
  const FILLED = {
    founded: '年份（测试用）',
    team: '人数（测试用）',
    office: '城市（测试用）',
    platforms: '平台（测试用）',
  };
  const text = (html: string) => textRuns(html).join(' ');

  it('设计稿里这一块是四个标签加四个【待填】', () => {
    const block = FACTS_BLOCK.exec(designFrame('page-about'))?.[0] ?? '';

    expect(textRuns(block)).toEqual([
      '成立',
      '【待填：年份】',
      '团队',
      '【待填：人数】',
      '办公地',
      '【待填：城市】',
      '投放平台',
      '【待填：如 Meta / Google / TikTok】',
    ]);
    expect(Object.values(ABOUT_FACT_LABELS)).toEqual(
      textRuns(block).filter((run) => !run.startsWith('【待填')),
    );
  });

  it('四项现在都还没补齐', () => {
    expect(Object.values(ABOUT_FACTS)).toEqual([null, null, null, null]);
  });

  it('没补齐时整块不渲染，页面上没有【待填】字样，也没有那四个标签', async () => {
    const html = await container.renderToString(AboutFacts);

    expect(html.trim()).toBe('');
    expect(aboutPage).not.toContain('待填');
    expect(aboutPage).not.toContain('about-facts');
    expect(aboutPage).not.toMatch(/<dl\b/);
    for (const label of Object.values(ABOUT_FACT_LABELS)) {
      expect(textRuns(aboutPage)).not.toContain(label);
    }
  });

  it.each([
    ['只补了三项', { ...FILLED, platforms: null }],
    ['有一项是空字符串', { ...FILLED, team: '' }],
    ['有一项只有空格', { ...FILLED, office: '  ' }],
    ['一项都没补', ABOUT_FACTS],
  ])('%s：仍然整块不渲染', async (_, facts) => {
    const html = await container.renderToString(AboutFacts, {
      props: { facts },
    });

    expect(html.trim()).toBe('');
  });

  it('四项都补齐后按设计稿显示四列：标签在上，内容在下', async () => {
    const html = await container.renderToString(AboutFacts, {
      props: { facts: FILLED },
    });

    expect(html).toMatch(/^\s*<dl\b/);
    expect(html.match(/<dt\b/g)).toHaveLength(4);
    expect(html.match(/<dd\b/g)).toHaveLength(4);
    expect(text(html)).toBe(
      '成立 年份（测试用） 团队 人数（测试用） 办公地 城市（测试用） 投放平台 平台（测试用）',
    );
  });
});

describe('页头里指向这两个页面的链接', () => {
  const href = (key: string) =>
    NAV_ITEMS.find((item) => item.key === key)?.href;

  it('「我们的产品」「关于我们」是真实地址', () => {
    expect(href('products')).toBe('/products/');
    expect(href('about')).toBe('/about/');
  });

  it('两个页面的页头里都是这两个地址', () => {
    for (const page of [productsPage, aboutPage]) {
      expect(page).toMatch(/<a[^>]*href="\/products\/"[^>]*>\s*我们的产品 ↗/);
      expect(page).toMatch(/<a[^>]*href="\/about\/"[^>]*>\s*关于我们 ↗/);
    }
  });
});

describe('子页面：图片走站点统一的图片管线', () => {
  it.each(PRODUCT_SCREENS)(
    '%s：每张图都有 AVIF、WebP、宽高和 alt，不直接引原图',
    (name) => {
      for (const { img, picture } of images(site(name))) {
        expect(picture, img).toMatch(/<source[^>]*type="image\/avif"/);
        expect(img).toMatch(/\ssrcset="/);
        expect(img).toMatch(/\swidth="\d+"/);
        expect(img).toMatch(/\sheight="\d+"/);
        // 空的 alt 会被输出成不带值的属性
        expect(img).toMatch(/\salt[\s=>]/);
      }
    },
  );

  it('第 1 屏只有字，下面两屏的图全部延迟加载', () => {
    expect(images(site('page-products'))).toHaveLength(0);
    expect(images(productsPage)).toHaveLength(19 + 4);
    for (const { img } of images(productsPage)) {
      expect(img).toContain('loading="lazy"');
    }
  });
});

describe('子页面：素材和文案的规则', () => {
  const assets = new Map(
    manifest.assets.map((asset) => [asset.file.split('/').pop()!, asset]),
  );

  it.each(PRODUCT_SCREENS)(
    '%s：每个素材都在图片清单里登记了用在这一屏',
    (name) => {
      for (const file of new Set(imageFiles(site(name)))) {
        expect(assets.get(file)?.usedIn, `${name} 的 ${file}`).toContain(name);
      }
    },
  );

  it('清单里登记用在这几屏的图，页面上都用到了', () => {
    for (const name of PRODUCT_SCREENS) {
      const listed = manifest.assets
        .filter((asset) => asset.usedIn.includes(name))
        .map((asset) => asset.file.split('/').pop()!)
        .sort();

      expect([...new Set(imageFiles(site(name)))].sort(), name).toEqual(listed);
    }
  });

  it('第 2 屏（广告）只用广告图片和产品抠图，不放达人素材', () => {
    const files = new Set(imageFiles(site('page-products-ads')));

    expect(files.size).toBe(19);
    for (const file of files) {
      expect(['ad-image', 'product-cutout'], file).toContain(
        assets.get(file)?.kind,
      );
    }
  });

  it('第 3 屏（星图）只用达人头像，账号名和清单里登记的一致', () => {
    const html = site('page-products-creators');
    const items = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(
      ([, item = '']) => item,
    );

    expect(items).toHaveLength(4);
    for (const item of items) {
      const asset = assets.get(imageFiles(item)[0] ?? '');

      expect(asset?.kind).toBe('creator-avatar');
      expect(textRuns(item)[0]).toBe(
        asset && 'creatorHandle' in asset ? asset.creatorHandle : undefined,
      );
    }
  });

  it('产品页没有视频', () => {
    expect(productsPage).not.toMatch(/<video\b/);
  });

  it.each(['page-products-ads', 'page-products-creators'] as const)(
    '%s：虚构品牌内容旁边标了「示例」',
    (name) => {
      expect(textRuns(site(name)).join(' ')).toContain('示例');
    },
  );

  it('不出现不能写的话', () => {
    const text = textRuns(productsPage + aboutPage).join(' ');

    for (const word of ['飞轮', '越用越准', '品类经验库', '复盘']) {
      expect(text).not.toContain(word);
    }
  });
});
