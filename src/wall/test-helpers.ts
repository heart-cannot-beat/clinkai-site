// 只给测试用：从设计交接包里取对照用的基准。

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
