// 示例图的线上管线：一张原图 → AVIF 和 WebP 两种格式、每种几档宽度 → <picture>。
// 用 Astro 自带的图片处理（astro:assets 的 getImage，底下是 sharp），在构建时出图，
// 文件名带内容哈希，输出到 dist/_astro/。版本墙和 ExampleImage 组件都走这里，
// 同一张图只处理一次、只有一套文件。

import { getImage } from 'astro:assets';
import { exampleImage } from './catalog';
import {
  candidateWidths,
  displayWidth,
  sizesFor,
  type DisplayBox,
} from './responsive';

/** 一张图转好的几组地址。和用在页面哪里、显示多大无关，所以每张图只做一次 */
export interface PreparedPicture {
  file: string;
  /** 原图宽高 */
  width: number;
  height: number;
  /** <source type="image/avif"> 的 srcset */
  avifSrcset: string;
  /** <img> 本身用 WebP：不支持 AVIF 的浏览器拿它 */
  src: string;
  srcset: string;
}

/**
 * 先给 AVIF，WebP 兜底。WebP 在微信内置浏览器和 Safari 14 以上都能用，
 * 所以不再出 JPEG。
 */
export const PICTURE_FORMATS = ['avif', 'webp'] as const;

const prepared = new Map<string, Promise<PreparedPicture>>();

/** 构建时出图。同一张图多处使用，只转一次 */
export function preparePicture(file: string): Promise<PreparedPicture> {
  let picture = prepared.get(file);
  if (!picture) {
    picture = convert(file);
    prepared.set(file, picture);
  }
  return picture;
}

async function convert(file: string): Promise<PreparedPicture> {
  const image = exampleImage(file);
  const widths = candidateWidths(image.width);
  const [avif, webp] = await Promise.all(
    PICTURE_FORMATS.map((format) => getImage({ src: image, format, widths })),
  );
  return {
    file,
    width: image.width,
    height: image.height,
    avifSrcset: avif.srcSet.attribute,
    src: webp.src,
    srcset: webp.srcSet.attribute,
  };
}

export interface PictureOptions extends DisplayBox {
  /** 默认是空的：示例图在页面上大多是装饰，说明写在外层（比如整面墙的 aria-label） */
  alt?: string;
  /**
   * 首屏的图：立即加载、优先下载。其余一律延迟加载。
   * 首屏图片的总体积有上限，构建时检查（见 docs/media.md）。
   */
  priority?: boolean;
  /** 图片本身的内联样式，照设计稿写 */
  style?: string;
}

export interface PictureAttributes {
  source: { type: 'image/avif'; srcset: string; sizes: string };
  img: {
    src: string;
    srcset: string;
    sizes: string;
    width: number;
    height: number;
    alt: string;
    loading: 'lazy' | 'eager';
    decoding?: 'async';
    fetchpriority?: 'high';
    style?: string;
  };
}

/** <picture> 里 <source> 和 <img> 的属性。组件和版本墙共用这一份 */
export function pictureAttributes(
  picture: PreparedPicture,
  options: PictureOptions,
): PictureAttributes {
  const sizes = sizesFor(displayWidth(picture, options));
  const { alt = '', priority = false, style } = options;
  return {
    source: { type: 'image/avif', srcset: picture.avifSrcset, sizes },
    img: {
      src: picture.src,
      srcset: picture.srcset,
      sizes,
      width: picture.width,
      height: picture.height,
      alt,
      ...(priority
        ? { loading: 'eager', fetchpriority: 'high' }
        : { loading: 'lazy', decoding: 'async' }),
      ...(style === undefined ? {} : { style }),
    },
  };
}

function escapeAttribute(value: string | number): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function attributesHtml(attributes: object): string {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
}

/** 同样的 <picture>，输出成 HTML 字符串：版本墙在构建时拼 HTML 用 */
export function pictureHtml(
  picture: PreparedPicture,
  options: PictureOptions,
): string {
  const { source, img } = pictureAttributes(picture, options);
  return `<picture><source${attributesHtml(source)}><img${attributesHtml(img)}></picture>`;
}
