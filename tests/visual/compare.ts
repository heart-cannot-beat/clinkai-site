// 两张截图逐像素比。纯函数，不碰浏览器和文件，单元测试在 compare.test.ts。

/** 一张图的像素：RGBA，每个通道 0–255，从左上角起逐行排 */
export interface Bitmap {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface Difference {
  /** 整张图的像素数 */
  pixels: number;
  /** 差值超过容差的像素数 */
  differing: number;
  /** differing ÷ pixels */
  ratio: number;
  /** 所有像素里最大的差值（0–255），不管有没有超过容差 */
  maxDelta: number;
  /** 差异图：基准图变淡变灰当底，超过容差的像素标成红色 */
  image: Bitmap;
}

/** 差异图里标出差异的颜色 */
const MARK = [255, 0, 64] as const;

/**
 * 一个像素的差值：红、绿、蓝三个通道里差得最多的那个（0–255）。
 * 截图没有透明度，不比 alpha。
 */
function delta(a: Uint8Array, b: Uint8Array, offset: number): number {
  return Math.max(
    Math.abs(a[offset]! - b[offset]!),
    Math.abs(a[offset + 1]! - b[offset + 1]!),
    Math.abs(a[offset + 2]! - b[offset + 2]!),
  );
}

/**
 * 比两张一样大的图。差值大于 tolerance 的像素算「有差异」。
 * 尺寸不同直接报错：那不是像素差一点的问题，是这一屏的大小就不对。
 */
export function compare(
  expected: Bitmap,
  actual: Bitmap,
  tolerance: number,
): Difference {
  if (expected.width !== actual.width || expected.height !== actual.height) {
    throw new Error(
      `两张图尺寸不同：基准图 ${expected.width}×${expected.height}，` +
        `站点 ${actual.width}×${actual.height}`,
    );
  }

  const pixels = expected.width * expected.height;
  const image = new Uint8Array(pixels * 4);
  let differing = 0;
  let maxDelta = 0;

  for (let offset = 0; offset < pixels * 4; offset += 4) {
    const d = delta(expected.data, actual.data, offset);
    if (d > maxDelta) maxDelta = d;

    if (d > tolerance) {
      differing += 1;
      image[offset] = MARK[0];
      image[offset + 1] = MARK[1];
      image[offset + 2] = MARK[2];
    } else {
      // 底图：基准图的亮度，压到很淡，只留一个能认出位置的影子
      const luma =
        0.299 * expected.data[offset]! +
        0.587 * expected.data[offset + 1]! +
        0.114 * expected.data[offset + 2]!;
      const faint = Math.round(255 - (255 - luma) * 0.2);
      image[offset] = faint;
      image[offset + 1] = faint;
      image[offset + 2] = faint;
    }
    image[offset + 3] = 255;
  }

  return {
    pixels,
    differing,
    ratio: differing / pixels,
    maxDelta,
    image: { width: expected.width, height: expected.height, data: image },
  };
}
