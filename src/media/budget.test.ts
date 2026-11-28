import { describe, expect, it } from 'vitest';
import {
  FIRST_SCREEN_BUDGET,
  firstScreen,
  pageImages,
  pickCandidate,
  slotWidth,
} from './budget';
import { pictureHtml, type PreparedPicture } from './picture';

// 构建产物里的写法：/_astro/名字.哈希.格式
const picture: PreparedPicture = {
  file: 'ugc_dawn.jpg',
  width: 720,
  height: 1280,
  avifSrcset: '/_astro/ugc_dawn.a.avif 320w, /_astro/ugc_dawn.b.avif 720w',
  src: '/_astro/ugc_dawn.d.webp',
  srcset: '/_astro/ugc_dawn.c.webp 320w, /_astro/ugc_dawn.d.webp 720w',
};

describe('sizes 在 1440 宽的屏幕上算出多宽', () => {
  it('按第一条符合的媒体条件', () => {
    expect(slotWidth('(min-width: 1440px) 26.46vw, 381px')).toBeCloseTo(381, 0);
    expect(slotWidth('(min-width: 1440px) 26.46vw, 381px', 1280)).toBe(381);
    expect(slotWidth('(max-width: 767px) 100vw, 200px')).toBe(200);
  });

  it('没写 sizes 按 100vw', () => {
    expect(slotWidth(undefined)).toBe(1440);
  });

  it('看不懂的写法直接报错，不悄悄算错', () => {
    expect(() => slotWidth('calc(100vw - 80px)')).toThrow(/看不懂 sizes/);
  });
});

describe('浏览器从 srcset 里挑哪个', () => {
  const srcset = '/a 320w, /b 640w, /c 960w';

  it('挑够用的里面最小的：381 宽的 2 倍屏要 762', () => {
    expect(pickCandidate(srcset, '381px')).toBe('/c');
    expect(pickCandidate(srcset, '300px')).toBe('/b');
    expect(pickCandidate(srcset, '400px', { width: 1440, dpr: 1 })).toBe('/b');
    expect(pickCandidate(srcset, '100px', { width: 1440, dpr: 1 })).toBe('/a');
  });

  it('都不够就挑最大的', () => {
    expect(pickCandidate(srcset, '1000px')).toBe('/c');
  });

  it('按倍数写的 srcset 挑 2x', () => {
    expect(pickCandidate('/a 1x, /b 2x', undefined)).toBe('/b');
  });
});

describe('页面里的图', () => {
  it('图片管线输出的 <picture>：两种格式各挑一个，没有问题', () => {
    const [image] = pageImages(
      pictureHtml(picture, { width: 381, height: 381, priority: true }),
    );

    expect(image).toMatchObject({
      eager: true,
      picks: [
        { type: 'image/avif', url: '/_astro/ugc_dawn.b.avif' },
        { type: 'img', url: '/_astro/ugc_dawn.d.webp' },
      ],
      problems: [],
    });
  });

  it('默认延迟加载的不算首屏', () => {
    const [image] = pageImages(pictureHtml(picture, { width: 100 }));

    expect(image?.eager).toBe(false);
    expect(image?.picks.map((pick) => pick.url)).toEqual([
      '/_astro/ugc_dawn.a.avif',
      '/_astro/ugc_dawn.c.webp',
    ]);
  });

  it('没走图片管线的 <img> 被拦下来', () => {
    const [image] = pageImages('<img src="/_astro/acme_moon.x.jpg">');

    expect(image?.eager).toBe(true);
    expect(image?.problems).toEqual([
      '没有 AVIF 的 <source>',
      '<img> 本身不是 WebP',
      'srcset 少于两个尺寸',
      '没写 width 和 height',
      '没写 alt',
    ]);
  });

  it('SVG 和 data: 地址的图不要求转格式', () => {
    const images = pageImages(
      '<img src="/logo.svg" alt="ClinkAI"><img src="data:image/svg+xml,x" alt="">',
    );

    expect(images.flatMap((image) => image.problems)).toEqual([]);
  });

  it('Astro 输出的写法也认：空 alt 不带等号、属性里有 &amp;', () => {
    const [image] = pageImages(
      '<picture><source type="image/avif" srcset="/a.avif?w=1&amp;f=avif 320w, /b.avif 640w" sizes="100px">' +
        '<img src="/_image?w=640&amp;f=webp" srcset="/c 320w, /d 640w" sizes="200px" width="640" height="480" alt loading="lazy"></picture>',
    );

    expect(image?.problems).toEqual([]);
    expect(image?.picks[0]?.url).toBe('/a.avif?w=1&f=avif');
  });
});

describe('首屏图片总体积', () => {
  const sizes: Record<string, number> = {
    '/_astro/ugc_dawn.b.avif': 60 * 1024,
    '/_astro/ugc_dawn.d.webp': 120 * 1024,
  };
  const sizeOf = (url: string) => sizes[url] ?? 0;
  const hero = pictureHtml(picture, {
    width: 381,
    height: 381,
    priority: true,
  });

  it('每张按最重的那种格式算，延迟加载的不算', () => {
    const report = firstScreen(
      pageImages(hero + pictureHtml(picture, { width: 381 })),
      sizeOf,
    );

    expect(report.images).toHaveLength(1);
    expect(report.total).toBe(120 * 1024);
    expect(report.overBudget).toBe(false);
  });

  it('加起来超过上限就算超', () => {
    const report = firstScreen(pageImages(hero + hero), sizeOf);

    expect(report.total).toBe(240 * 1024);
    expect(report.total).toBeGreaterThan(FIRST_SCREEN_BUDGET);
    expect(report.overBudget).toBe(true);
  });

  it('上限是 200 KB', () => {
    expect(FIRST_SCREEN_BUDGET).toBe(204800);
  });
});
