import { describe, expect, it } from 'vitest';
import manifest from '../../design/assets/manifest.json';
import { exampleImage, exampleImageFiles, exampleVideoUrl } from './catalog';

// 站点自己的一份在 src/assets/，从设计交接包 design/assets/ 原样拷来。
// 设计侧换了图、加了图，或者改了哪张图有没有屏在用，这里的测试会挂，
// 按 docs/media.md 重新拷一份。
// ?inline 让 Vite 把文件读成 base64，不用 Node 的文件接口也能逐字节比较。

const siteFiles = import.meta.glob<string>('../assets/{img,video}/*', {
  query: '?inline',
  import: 'default',
});
const designFiles = import.meta.glob<string>(
  '../../design/assets/{img,video}/*',
  { query: '?inline', import: 'default' },
);

// 清单里的 file 是相对 design/assets/ 的路径，例如 img/pebble_cut_open.webp
const listed = manifest.assets.map((asset) => asset.file).sort();
// 清单的规则：usedIn 为空的图现在没有任何一屏在用，不进线上。
// 站点只拷有屏在用的那些；没人用的留在交接包里。
const inUse = manifest.assets
  .filter((asset) => asset.usedIn.length > 0)
  .map((asset) => asset.file)
  .sort();
const unused = listed.filter((file) => !inUse.includes(file));
const site = Object.keys(siteFiles)
  .map((path) => path.replace('../assets/', ''))
  .sort();
const design = Object.keys(designFiles)
  .map((path) => path.replace('../../design/assets/', ''))
  .sort();

describe('示例素材：站点自己的一份和交接包一致', () => {
  it('交接包里的图片和视频都登记在清单里', () => {
    expect(design).toEqual(listed);
  });

  it('src/assets/ 里正好是清单里有屏在用的那些文件，没有别的', () => {
    expect(site).toEqual(inUse);
    expect(exampleImageFiles.map((file) => `img/${file}`)).toEqual(
      inUse.filter((file) => file.startsWith('img/')),
    );
  });

  it('现在有 58 张图和 2 个视频在用', () => {
    expect(inUse.filter((file) => file.startsWith('img/'))).toHaveLength(58);
    expect(inUse.filter((file) => file.startsWith('video/'))).toHaveLength(2);
  });

  it.each(unused)('%s 没有任何一屏在用（usedIn 为空），不进站点', (file) => {
    expect(site).not.toContain(file);
    expect(() => exampleImage(file.replace('img/', ''))).toThrow(/缺示例图/);
  });

  it.each(inUse)('%s 和交接包里的同名文件逐字节一致', async (file) => {
    const ours = await siteFiles[`../assets/${file}`]?.();
    const theirs = await designFiles[`../../design/assets/${file}`]?.();

    expect(ours).toMatch(/^data:(image|video)\/[\w-]+;base64,/);
    expect(ours).toBe(theirs);
  });
});

describe('按文件名取素材', () => {
  it.each(
    manifest.assets.filter(
      (asset) => asset.file.startsWith('img/') && asset.usedIn.length > 0,
    ),
  )('$file 的宽高和清单一致', (asset) => {
    const image = exampleImage(asset.file.replace('img/', ''));

    expect([image.width, image.height]).toEqual([asset.width, asset.height]);
  });

  it('视频能换成站点上的地址', () => {
    for (const file of ['creator-pebble.webm', 'creator-pebble.mp4']) {
      const url = exampleVideoUrl(file);

      expect(url).toMatch(/^\//);
      expect(url).toContain('creator-pebble');
      expect(url).not.toContain('design/');
    }
  });

  it('没有的文件报错，不会输出一个打不开的地址', () => {
    expect(() => exampleImage('real_customer.jpg')).toThrow(
      /real_customer\.jpg/,
    );
    expect(() => exampleVideoUrl('real_customer.mp4')).toThrow(
      /real_customer\.mp4/,
    );
  });
});
