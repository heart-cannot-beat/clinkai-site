// 站点上的示例图片和视频。文件在 src/assets/img/ 和 src/assets/video/，从设计交接包
// design/assets/ 原样拷来，逐字节一致（catalog.test.ts 守着）。站点构建不读 design/。
// 全部是 AI 生成的示例素材：品牌和人物都是虚构的，页面上每一处都要标「示例」。

import type { ImageMetadata } from 'astro';

const IMAGE_DIR = '../assets/img/';
const VIDEO_DIR = '../assets/video/';

// 按 Astro 的图片导入方式读：拿到宽高和格式，交给 astro:assets 转格式、出多尺寸
const images = import.meta.glob<ImageMetadata>('../assets/img/*', {
  eager: true,
  import: 'default',
});

// 视频不转码，原样打包，文件名带内容哈希
const videos = import.meta.glob<string>('../assets/video/*', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** 全部示例图的文件名，例如 pebble_trumpet.jpg */
export const exampleImageFiles: string[] = Object.keys(images)
  .map((path) => path.slice(IMAGE_DIR.length))
  .sort();

export function exampleImage(file: string): ImageMetadata {
  const image = images[`${IMAGE_DIR}${file}`];
  if (!image) throw new Error(`缺示例图：src/assets/img/${file}`);
  return image;
}

/** 示例视频在站点上的地址 */
export function exampleVideoUrl(file: string): string {
  const url = videos[`${VIDEO_DIR}${file}`];
  if (!url) throw new Error(`缺示例视频：src/assets/video/${file}`);
  return url;
}
