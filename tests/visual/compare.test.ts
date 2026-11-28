import { describe, expect, it } from 'vitest';
import { compare, type Bitmap } from './compare';

/** 一张纯色的图 */
function solid(
  width: number,
  height: number,
  [r, g, b]: [number, number, number],
): Bitmap {
  const data = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data.set([r, g, b, 255], offset);
  }
  return { width, height, data };
}

/** 改掉一个像素 */
function paint(
  bitmap: Bitmap,
  x: number,
  y: number,
  [r, g, b]: [number, number, number],
): void {
  bitmap.data.set([r, g, b, 255], (y * bitmap.width + x) * 4);
}

describe('截图逐像素比', () => {
  it('两张一样的图：没有差异', () => {
    const result = compare(
      solid(4, 3, [230, 228, 223]),
      solid(4, 3, [230, 228, 223]),
      0,
    );

    expect(result.pixels).toBe(12);
    expect(result.differing).toBe(0);
    expect(result.ratio).toBe(0);
    expect(result.maxDelta).toBe(0);
  });

  it('差值按三个通道里差得最多的那个算', () => {
    const expected = solid(2, 2, [100, 100, 100]);
    const actual = solid(2, 2, [100, 100, 100]);
    paint(actual, 1, 0, [103, 90, 100]);

    const result = compare(expected, actual, 0);

    expect(result.maxDelta).toBe(10);
    expect(result.differing).toBe(1);
    expect(result.ratio).toBe(0.25);
  });

  it('差值刚好等于容差不算差异，多 1 才算', () => {
    const expected = solid(2, 1, [0, 0, 0]);
    const actual = solid(2, 1, [0, 0, 0]);
    paint(actual, 0, 0, [24, 0, 0]);
    paint(actual, 1, 0, [0, 25, 0]);

    const result = compare(expected, actual, 24);

    expect(result.differing).toBe(1);
    expect(result.maxDelta).toBe(25);
  });

  it('不比透明度', () => {
    const expected = solid(1, 1, [10, 20, 30]);
    const actual = solid(1, 1, [10, 20, 30]);
    actual.data[3] = 0;

    expect(compare(expected, actual, 0).differing).toBe(0);
  });

  it('差异图和原图一样大，有差异的像素是红色，其余是变淡的灰', () => {
    const expected = solid(2, 1, [0, 0, 0]);
    const actual = solid(2, 1, [0, 0, 0]);
    paint(actual, 1, 0, [255, 255, 255]);

    const { image } = compare(expected, actual, 0);

    expect(image.width).toBe(2);
    expect(image.height).toBe(1);
    // 没差异的那个像素：黑色压淡成浅灰，三个通道相等
    expect([...image.data.slice(0, 4)]).toEqual([204, 204, 204, 255]);
    // 有差异的那个像素
    expect([...image.data.slice(4, 8)]).toEqual([255, 0, 64, 255]);
  });

  it('尺寸不同直接报错，写明两边的大小', () => {
    expect(() =>
      compare(solid(1440, 900, [0, 0, 0]), solid(1440, 1200, [0, 0, 0]), 0),
    ).toThrow('基准图 1440×900，站点 1440×1200');
  });
});
