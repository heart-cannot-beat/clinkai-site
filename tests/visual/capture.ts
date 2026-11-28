// 给一屏截图之前要做的事：等字体和图片、确认视频停在封面上、（需要时）把图片藏起来、整页重画一遍。
// 设计稿和站点走的是同一套步骤。
import type { Locator, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import type { Bitmap } from './compare';

/** 截图前这一屏的状态，有问题的地方列出来 */
export interface FrameState {
  /** 加载完成的 Inter Tight 字体文件数 */
  interTightFaces: number;
  /** 加载失败的字体 */
  failedFonts: string[];
  /** 没加载出来的图片 */
  brokenImages: string[];
  /** 没停在封面上的视频（在播，或者已经播过） */
  movingVideos: string[];
}

/** 一屏的左上角在整页里的位置（像素） */
export interface Position {
  left: number;
  top: number;
}

/**
 * 等这一屏画稳：字体加载完；这一屏里的图片全部加载并解码完。
 * 站点的图片大多是延迟加载的，有些还排在画布外面，永远不会自己开始加载，所以先改成立即加载。
 */
export async function settle(page: Page, frame: Locator): Promise<FrameState> {
  await page.waitForLoadState('load');

  const brokenImages = await frame.evaluate(async (root) => {
    const all = [...root.querySelectorAll('img')];
    for (const img of all) img.loading = 'eager';
    await Promise.all(
      all.map(async (img) => {
        if (!img.complete) {
          await new Promise((done) => {
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          });
        }
        await img.decode().catch(() => undefined);
      }),
    );
    return all
      .filter((img) => img.naturalWidth === 0)
      .map((img) => img.currentSrc || img.src);
  });

  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts];
    return {
      interTight: faces.filter(
        (face) =>
          face.status === 'loaded' && face.family.includes('Inter Tight'),
      ).length,
      failed: faces
        .filter((face) => face.status === 'error')
        .map((face) => face.family),
    };
  });

  // 视频文件没有给（routes.ts），所以两边的视频都应该停在最开头、露出封面
  const movingVideos = await frame.evaluate((root) =>
    [...root.querySelectorAll('video')]
      .filter(
        (video) =>
          !video.paused || video.currentTime > 0 || 'playing' in video.dataset,
      )
      .map((video) => video.currentSrc || video.ariaLabel || '<video>'),
  );

  return {
    interTightFaces: fonts.interTight,
    failedFonts: fonts.failed,
    brokenImages,
    movingVideos,
  };
}

/** 这一屏的左上角在整页里的位置 */
export function positionOf(frame: Locator): Promise<Position> {
  return frame.evaluate((root) => {
    const box = root.getBoundingClientRect();
    return { left: box.left + window.scrollX, top: box.top + window.scrollY };
  });
}

/**
 * 把设计稿的那一帧挪到整页里的指定位置（设计稿文件里它本来贴着左上角）。
 * 浏览器画大字的斜边、渐变的抖动，结果和这块东西在整页里的位置有关：同一帧放在页面顶上和放在
 * 往下 5400px 的地方，能差出两千多个像素。所以基准图要渲染在和站点那一屏相同的位置上。
 */
export async function moveTo(page: Page, position: Position): Promise<void> {
  await page.addStyleTag({
    content: `body { padding: ${position.top}px 0 0 ${position.left}px !important; }`,
  });
}

/** 把页面上的图片和视频藏起来（位置还占着），只留版式、文字和色块 */
export async function hideImages(page: Page): Promise<void> {
  await page.addStyleTag({
    content: 'img, video { visibility: hidden !important; }',
  });
}

/**
 * 让浏览器把整页从头重画一遍。
 * 图片陆续解码完、图片被藏起来，浏览器都只重画变了的那几块；局部重画时形状边缘的抗锯齿
 * 和「之前画过什么」有关，同一个画面先后两次能差出几个到几十个像素。整页重画一遍，结果就只和画面本身有关。
 */
async function repaint(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const twoFrames = () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      );
    document.body.style.display = 'none';
    await twoFrames();
    document.body.style.display = '';
    await twoFrames();
  });
}

/** 给一屏截图，解成像素 */
export async function shoot(page: Page, frame: Locator): Promise<Bitmap> {
  await repaint(page);
  const png = await frame.screenshot({
    type: 'png',
    scale: 'css',
    animations: 'disabled',
    caret: 'hide',
  });
  return PNG.sync.read(png);
}

/** 像素编回 PNG */
export function toPng(bitmap: Bitmap): Buffer {
  const png = new PNG({ width: bitmap.width, height: bitmap.height });
  png.data = Buffer.from(bitmap.data);
  return PNG.sync.write(png);
}
