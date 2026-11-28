import { describe, expect, it } from 'vitest';
import heroScreen from '../../design/screens/01-hero.html?raw';
import { HERO_BOARD, HERO_BOARD_IMAGES, HERO_IMAGE_SIZE } from './hero';

describe('首屏叠板上的图，和设计稿第 1 屏对得上', () => {
  it('三张图、顺序一致，首屏只有这三张', () => {
    const files = [
      ...heroScreen.matchAll(/<img src="\.\.\/assets\/img\/([^"]+)"/g),
    ].map((match) => match[1]);

    expect(files).toEqual([...HERO_BOARD_IMAGES]);
  });

  it('叠板的大小和放大倍数', () => {
    expect(heroScreen).toContain(
      `width: ${HERO_BOARD.size}px; height: ${HERO_BOARD.size}px; transform: rotateX(58deg) rotateZ(-42deg) scale(${HERO_BOARD.scale})`,
    );
    expect(HERO_IMAGE_SIZE).toBe(381);
  });
});
