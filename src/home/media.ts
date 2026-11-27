// 首页各屏用到的示例图片和视频在站点上的地址。
// 文件是从设计交接包 design/assets/ 原样拷来的示例素材（虚构品牌，AI 生成，见 design/assets/manifest.json）：
// - src/assets/wall/：版本墙用到的那些（S-05），03 和 03b 屏的广告卡片和新版本也用其中几张
// - src/assets/img/：其余几屏用到、墙里没有的
// - src/assets/video/：04 屏中间那条达人示例视频
// 构建时由 Vite 打包并加上内容哈希。格式转换、多尺寸和按需加载是 P-05 的事。

const images = import.meta.glob<string>(
  ['../assets/img/*', '../assets/wall/*'],
  { eager: true, query: '?url', import: 'default' },
);

const videos = import.meta.glob<string>('../assets/video/*', {
  eager: true,
  query: '?url',
  import: 'default',
});

function lookup(
  urls: Record<string, string>,
  directories: readonly string[],
  file: string,
): string | undefined {
  for (const directory of directories) {
    const url = urls[`../assets/${directory}/${file}`];
    if (url) return url;
  }
  return undefined;
}

/** 示例图片的地址。file 是交接包 design/assets/img/ 里的文件名 */
export function exampleImageUrl(file: string): string {
  const url = lookup(images, ['img', 'wall'], file);
  if (!url) throw new Error(`首页缺图片：src/assets/img/${file}`);
  return url;
}

/** 示例视频的地址。file 是交接包 design/assets/video/ 里的文件名 */
export function exampleVideoUrl(file: string): string {
  const url = lookup(videos, ['video'], file);
  if (!url) throw new Error(`首页缺视频：src/assets/video/${file}`);
  return url;
}
