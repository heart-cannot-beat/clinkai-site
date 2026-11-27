// 版本墙用到的图片在站点上的地址。
// 文件在 src/assets/wall/，是从设计交接包 design/assets/img/ 原样拷来的示例素材
// （虚构品牌 Pebblesound，只有广告图和产品图）。构建时由 Vite 打包并加上内容哈希。

const urls = import.meta.glob<string>('../assets/wall/*', {
  eager: true,
  query: '?url',
  import: 'default',
});

export function wallImageUrl(file: string): string {
  const url = urls[`../assets/wall/${file}`];
  if (!url) throw new Error(`版本墙缺图片：src/assets/wall/${file}`);
  return url;
}
