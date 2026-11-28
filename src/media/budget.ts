// 构建产物里的图片检查：首屏图片的体积上限，以及所有图片都走了图片管线。
// 这里只解析 HTML、做算术；读文件和让构建失败在 integration.ts。
// 上限是怎么定的见 docs/media.md。

/**
 * 首屏图片的体积上限：一个页面里所有不延迟加载的图片加起来，不超过 200 KB。
 * 定法：Lighthouse 模拟手机网络的下行速度是 1.6 Mbps（约 200 KB/s），
 * 首屏的图一秒钟内要能下完。
 */
export const FIRST_SCREEN_BUDGET = 200 * 1024;

/** 量首屏时假定的屏幕：设计稿的 1440 宽，2 倍屏 */
export const REFERENCE_VIEWPORT = { width: 1440, dpr: 2 } as const;

/** 一张图的一种格式：浏览器在 srcset 里挑中的那个文件 */
export interface Pick {
  type: string;
  url: string;
}

/** 页面上的一张图 */
export interface PageImage {
  /** <img> 标签本身，报错时给人看 */
  tag: string;
  /** 不延迟加载：算首屏 */
  eager: boolean;
  /** 每种格式各挑中哪个文件。<picture> 里有几个 <source> 加上 <img> 本身，就有几种 */
  picks: Pick[];
  /** 不合图片管线要求的地方，空的就是没问题 */
  problems: string[];
}

type Attributes = Record<string, string>;

function parseAttributes(tag: string): Attributes {
  const attributes: Attributes = {};
  const body = tag.replace(/^<\w+/, '').replace(/\/?>$/, '');
  for (const match of body.matchAll(
    /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
  )) {
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attributes[match[1]!.toLowerCase()] = value.replaceAll('&amp;', '&');
  }
  return attributes;
}

/** sizes 在参考屏幕上算出来的宽度（CSS 像素）。只认 px、vw 和 min-width/max-width */
export function slotWidth(
  sizes: string | undefined,
  viewport: number = REFERENCE_VIEWPORT.width,
): number {
  if (!sizes) return viewport; // 没写 sizes 时浏览器按 100vw 算
  for (const entry of sizes.split(',').map((part) => part.trim())) {
    const match =
      /^(?:\((min|max)-width:\s*(\d+(?:\.\d+)?)px\)\s+)?(\d+(?:\.\d+)?)(px|vw)$/.exec(
        entry,
      );
    if (!match) throw new Error(`看不懂 sizes：${sizes}`);
    const [, kind, limit, value, unit] = match;
    const applies =
      kind === undefined ||
      (kind === 'min' ? viewport >= Number(limit) : viewport <= Number(limit));
    if (!applies) continue;
    return unit === 'px' ? Number(value) : (Number(value) * viewport) / 100;
  }
  return viewport;
}

interface Candidate {
  url: string;
  width?: number;
  density?: number;
}

function parseSrcset(srcset: string): Candidate[] {
  return srcset
    .split(/,\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url = '', descriptor = '1x'] = entry.split(/\s+/);
      if (descriptor.endsWith('w')) {
        return { url, width: Number(descriptor.slice(0, -1)) };
      }
      return { url, density: Number(descriptor.slice(0, -1)) };
    });
}

/**
 * 浏览器会从 srcset 里挑哪个：要的像素宽 = sizes 算出的宽度 × 屏幕倍数，
 * 挑够用的里面最小的；都不够就挑最大的。
 */
export function pickCandidate(
  srcset: string,
  sizes: string | undefined,
  viewport: { width: number; dpr: number } = REFERENCE_VIEWPORT,
): string {
  const candidates = parseSrcset(srcset);
  const needed = candidates.some((candidate) => candidate.width !== undefined)
    ? slotWidth(sizes, viewport.width) * viewport.dpr
    : viewport.dpr;
  const scored = candidates
    .map((candidate) => ({
      url: candidate.url,
      score: candidate.width ?? candidate.density ?? 1,
    }))
    .sort((a, b) => a.score - b.score);
  const pick =
    scored.find((candidate) => candidate.score >= needed) ?? scored.at(-1);
  if (!pick) throw new Error(`srcset 是空的：${srcset}`);
  return pick.url;
}

const isVector = (url: string) => /^data:|\.svg(\?|$)/i.test(url);

function inspect(
  tag: string,
  img: Attributes,
  sources: Attributes[],
): PageImage {
  const problems: string[] = [];
  const picks: Pick[] = [];
  for (const source of sources) {
    const srcset = source.srcset ?? '';
    picks.push({
      type: source.type ?? '',
      url: pickCandidate(srcset, source.sizes),
    });
  }
  const url = img.srcset
    ? pickCandidate(img.srcset, img.sizes)
    : (img.src ?? '');
  picks.push({ type: 'img', url });

  if (!isVector(img.src ?? '')) {
    if (!sources.some((source) => source.type === 'image/avif')) {
      problems.push('没有 AVIF 的 <source>');
    }
    if (!/\.webp(\?|$)|[?&]f=webp(&|$)/.test(img.src ?? '')) {
      problems.push('<img> 本身不是 WebP');
    }
    for (const srcset of [...sources.map((s) => s.srcset), img.srcset]) {
      if (!srcset || parseSrcset(srcset).length < 2) {
        problems.push('srcset 少于两个尺寸');
        break;
      }
    }
    if (!img.width || !img.height) problems.push('没写 width 和 height');
  }
  if (img.alt === undefined) problems.push('没写 alt');

  return { tag, eager: img.loading !== 'lazy', picks, problems };
}

/** 页面里所有的 <img>，连同它所在 <picture> 的 <source> */
export function pageImages(html: string): PageImage[] {
  const images: PageImage[] = [];
  const rest = html.replace(
    /<picture\b[^>]*>([\s\S]*?)<\/picture>/gi,
    (_, inner: string) => {
      const sources = [...inner.matchAll(/<source\b[^>]*>/gi)].map((match) =>
        parseAttributes(match[0]),
      );
      for (const match of inner.matchAll(/<img\b[^>]*>/gi)) {
        images.push(inspect(match[0], parseAttributes(match[0]), sources));
      }
      return '';
    },
  );
  for (const match of rest.matchAll(/<img\b[^>]*>/gi)) {
    images.push(inspect(match[0], parseAttributes(match[0]), []));
  }
  return images;
}

export interface FirstScreenReport {
  /** 首屏的图，每张按最重的那种格式算（不支持 AVIF 的浏览器下 WebP） */
  images: { tag: string; bytes: number; url: string }[];
  total: number;
  overBudget: boolean;
}

/** 首屏图片总共多大。sizeOf 给出站点上一个地址对应文件的字节数 */
export function firstScreen(
  images: PageImage[],
  sizeOf: (url: string) => number,
  budget: number = FIRST_SCREEN_BUDGET,
): FirstScreenReport {
  const eager = images
    .filter((image) => image.eager)
    .map((image) => {
      const heaviest = image.picks
        .map((pick) => ({ url: pick.url, bytes: sizeOf(pick.url) }))
        .sort((a, b) => b.bytes - a.bytes)[0]!;
      return { tag: image.tag, ...heaviest };
    });
  const total = eager.reduce((sum, image) => sum + image.bytes, 0);
  return { images: eager, total, overBudget: total > budget };
}

export function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
