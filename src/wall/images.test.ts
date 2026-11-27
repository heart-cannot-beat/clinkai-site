import { describe, expect, it } from 'vitest';
import { pebblesoundWall } from './config';
import { wallImageUrl } from './images';

// 站点自己的图片放在 src/assets/wall/，是从设计交接包 design/assets/img/ 原样拷过来的。
// 设计侧换了图，这里的测试会挂，重新拷一份即可。
// ?inline 让 Vite 把文件内容读成 base64，这样不用 Node 的文件接口也能逐字节比较。

const siteImages = import.meta.glob<string>('../assets/wall/*', {
  eager: true,
  query: '?inline',
  import: 'default',
});
const designImages = import.meta.glob<string>('../../design/assets/img/*', {
  query: '?inline',
  import: 'default',
});

const configured = [
  ...Object.values(pebblesoundWall.cutouts),
  ...Object.values(pebblesoundWall.photos),
].map((image) => image.file);

describe('版本墙的图片：站点自己的一份', () => {
  it('src/assets/wall/ 里正好是配置登记的那几张，没有别的', () => {
    const files = Object.keys(siteImages).map((path) =>
      path.replace('../assets/wall/', ''),
    );

    expect(files.sort()).toEqual([...configured].sort());
  });

  it.each(configured)('%s 和交接包里的同名文件逐字节一致', async (file) => {
    const site = siteImages[`../assets/wall/${file}`];
    const design = await designImages[`../../design/assets/img/${file}`]?.();

    expect(site).toMatch(/^data:image\/(webp|jpeg);base64,/);
    expect(site).toBe(design);
  });

  it.each(configured)('%s 能换成站点上的地址', (file) => {
    const url = wallImageUrl(file);

    expect(url).toMatch(/^\//);
    expect(url).toContain(file.replace(/\.\w+$/, ''));
    expect(url).not.toContain('design/');
  });

  it('没登记的图片报错，不会输出一个打不开的地址', () => {
    expect(() => wallImageUrl('ugc_pebble.jpg')).toThrow(/ugc_pebble\.jpg/);
  });
});
