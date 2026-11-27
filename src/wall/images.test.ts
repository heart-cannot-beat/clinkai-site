import { describe, expect, it } from 'vitest';
import { wallImageUrl } from './images';
import { designWallImageFiles } from './test-helpers';

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

// design/wall/tiles.json 的小图里用到的那几张
const used = designWallImageFiles();

describe('版本墙的图片：站点自己的一份', () => {
  it('墙里用到 25 张不同的图', () => {
    expect(used).toHaveLength(25);
  });

  it('src/assets/wall/ 里正好是墙里用到的那几张，没有别的', () => {
    const files = Object.keys(siteImages).map((path) =>
      path.replace('../assets/wall/', ''),
    );

    expect(files.sort()).toEqual(used);
  });

  it.each(used)('%s 和交接包里的同名文件逐字节一致', async (file) => {
    const site = siteImages[`../assets/wall/${file}`];
    const design = await designImages[`../../design/assets/img/${file}`]?.();

    expect(site).toMatch(/^data:image\/(webp|jpeg);base64,/);
    expect(site).toBe(design);
  });

  it.each(used)('%s 能换成站点上的地址', (file) => {
    const url = wallImageUrl(file);

    expect(url).toMatch(/^\//);
    expect(url).toContain(file.replace(/\.\w+$/, ''));
    expect(url).not.toContain('design/');
  });

  it('不在墙里的图片报错，不会输出一个打不开的地址', () => {
    expect(() => wallImageUrl('ugc_pebble.jpg')).toThrow(/ugc_pebble\.jpg/);
  });
});
