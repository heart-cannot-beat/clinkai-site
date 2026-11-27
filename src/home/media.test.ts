import { describe, expect, it } from 'vitest';
import { designWallImageFiles } from '../wall/test-helpers';
import { exampleImageUrl, exampleVideoUrl } from './media';

// 首页自己的示例素材放在 src/assets/img/ 和 src/assets/video/，是从设计交接包原样拷过来的。
// 设计侧换了素材，这里的测试会挂，重新拷一份即可。
// ?inline 让 Vite 把文件内容读成 base64，这样不用 Node 的文件接口也能逐字节比较。

const siteFiles = import.meta.glob<string>(
  ['../assets/img/*', '../assets/video/*'],
  { eager: true, query: '?inline', import: 'default' },
);
const designFiles = import.meta.glob<string>(
  ['../../design/assets/img/*', '../../design/assets/video/*'],
  { query: '?inline', import: 'default' },
);
const designScreens = import.meta.glob<string>('../../design/screens/0*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** 设计稿首页那 7 屏里用到的文件名，按目录分开 */
function usedInDesign(directory: 'img' | 'video'): string[] {
  const files = new Set<string>();
  const pattern = new RegExp(`\\.\\./assets/${directory}/([^"]+)"`, 'g');
  for (const html of Object.values(designScreens)) {
    for (const match of html.matchAll(pattern)) files.add(match[1]!);
  }
  return [...files].sort();
}

const siteNames = (directory: 'img' | 'video') =>
  Object.keys(siteFiles)
    .filter((path) => path.startsWith(`../assets/${directory}/`))
    .map((path) => path.replace(`../assets/${directory}/`, ''))
    .sort();

const wallImages = designWallImageFiles();
const images = usedInDesign('img');
const videos = usedInDesign('video');

describe('首页的示例素材：站点自己的一份', () => {
  it('设计稿的 7 屏都读到了（防止读错路径导致空比空）', () => {
    expect(Object.keys(designScreens)).toHaveLength(7);
    expect(images.length).toBeGreaterThan(30);
    expect(videos).toEqual(['creator-pebble.mp4', 'creator-pebble.webm']);
  });

  it('src/assets/img/ 里正好是首页用到、版本墙目录里没有的那几张', () => {
    expect(siteNames('img')).toEqual(
      images.filter((file) => !wallImages.includes(file)),
    );
  });

  it('src/assets/video/ 里正好是 04 屏的两个视频文件', () => {
    expect(siteNames('video')).toEqual(videos);
  });

  it.each(Object.keys(siteFiles))(
    '%s 和交接包里的同名文件逐字节一致',
    async (path) => {
      const design =
        await designFiles[
          path.replace('../assets/', '../../design/assets/')
        ]?.();

      expect(siteFiles[path]).toMatch(/^data:(image|video)\/\w+;base64,/);
      expect(siteFiles[path]).toBe(design);
    },
  );

  it.each(images)('%s 能换成站点上的地址', (file) => {
    const url = exampleImageUrl(file);

    expect(url).toMatch(/^\//);
    expect(url).toContain(file.replace(/\.\w+$/, ''));
    expect(url).not.toContain('design/');
  });

  it.each(videos)('%s 能换成站点上的地址', (file) => {
    const url = exampleVideoUrl(file);

    expect(url).toMatch(/^\//);
    expect(url).not.toContain('design/');
  });

  it('没有的文件报错，不会输出一个打不开的地址', () => {
    expect(() => exampleImageUrl('pebble_cut_top.webp')).toThrow(
      /pebble_cut_top\.webp/,
    );
    expect(() => exampleVideoUrl('creator-pebble.mov')).toThrow(
      /creator-pebble\.mov/,
    );
  });
});
