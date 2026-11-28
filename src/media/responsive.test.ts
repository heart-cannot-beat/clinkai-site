import { describe, expect, it } from 'vitest';
import manifest from '../../design/assets/manifest.json';
import {
  CANVAS_WIDTH,
  candidateWidths,
  displayWidth,
  sizesFor,
} from './responsive';

const imageWidths = [
  ...new Set(
    manifest.assets
      .filter((asset) => asset.file.startsWith('img/'))
      .map((asset) => asset.width),
  ),
];

describe('每张图出哪几种宽度', () => {
  it.each(imageWidths)('原图宽 %i：至少两档，从小到大，不放大', (width) => {
    const widths = candidateWidths(width);

    expect(widths.length).toBeGreaterThanOrEqual(2);
    expect(widths).toEqual([...new Set(widths)].sort((a, b) => a - b));
    expect(widths.at(-1)).toBe(width);
  });

  it('按 320、640、960、1280 出，和原图太接近的那档不出', () => {
    expect(candidateWidths(1536)).toEqual([320, 640, 960, 1280, 1536]);
    expect(candidateWidths(1336)).toEqual([320, 640, 960, 1336]);
    expect(candidateWidths(960)).toEqual([320, 640, 960]);
    expect(candidateWidths(720)).toEqual([320, 720]);
    expect(candidateWidths(640)).toEqual([320, 640]);
  });

  it('原图很小（头像）：出一半宽和原宽', () => {
    expect(candidateWidths(256)).toEqual([128, 256]);
  });
});

describe('图在画布上显示多大', () => {
  it('只给宽度：就是这个宽度', () => {
    expect(displayWidth({ width: 640, height: 510 }, { width: 124 })).toBe(124);
  });

  it('给了框：按 object-fit: cover 铺满框时实际铺开的宽度', () => {
    // 横图放进竖框：高度撑满，宽度超出框
    expect(
      displayWidth({ width: 1536, height: 1024 }, { width: 140, height: 296 }),
    ).toBe(444);
    // 竖图放进方框：宽度撑满
    expect(
      displayWidth({ width: 960, height: 1200 }, { width: 381, height: 381 }),
    ).toBe(381);
  });
});

describe('sizes', () => {
  it('视口不小于画布时按比例放大，更窄时按画布上的像素', () => {
    expect(sizesFor(381)).toBe('(min-width: 1440px) 26.46vw, 381px');
    expect(sizesFor(CANVAS_WIDTH)).toBe('(min-width: 1440px) 100vw, 1440px');
  });
});
