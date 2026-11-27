// 只给测试用：从设计交接包里取对照用的基准。

import designWall from '../../design/wall/tiles.json';
import { buildWall } from './wall';

/** 从设计稿某一屏的 HTML 源里取出墙上的小图，一行一张 */
export function designScreenTiles(screen: string): string[] {
  return screen
    .split('\n')
    .filter((line) =>
      /^<div style="position: absolute; left: -?\d+px; top: -?\d+px; width: \d+px; height: \d+px; overflow: hidden; background: /.test(
        line,
      ),
    );
}

/** 设计稿的墙里用到的图片文件名，去重、排好序 */
export function designWallImageFiles(): string[] {
  const files = new Set<string>();
  buildWall(designWall, (file) => {
    files.add(file);
    return file;
  });
  return [...files].sort();
}
