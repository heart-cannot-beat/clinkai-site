// 截图对比：每一屏，用同一个浏览器把 design/screens/ 里的设计稿渲染成基准图，再给站点的同一屏截图，逐像素比。
// 说明见 docs/visual-compare.md。跑法：npm run test:visual。
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  hideImages,
  moveTo,
  positionOf,
  settle,
  shoot,
  toPng,
  type FrameState,
  type Position,
} from './capture';
import { compare, type Bitmap, type Difference } from './compare';
import { NUMBERS_ATTACHMENT, percent, type ScreenNumbers } from './reporter';
import { DESIGN_ORIGIN, serveFromDisk, SITE_ORIGIN } from './routes';
import { DESIGN_FRAME, LAYOUT, SCREENS, WITH_IMAGES } from './screens';

/** 一屏的两张截图：带图片的，和藏起图片的 */
interface Shots {
  state: FrameState;
  position: Position;
  withImages: Bitmap;
  layout: Bitmap;
}

/**
 * 打开页面，给里面的一屏截两张图。
 * moveFrameTo：先把这一屏挪到整页里的这个位置再截（只对设计稿用，见 capture.ts 的 moveTo）。
 */
async function capture(
  page: Page,
  url: string,
  selector: string,
  moveFrameTo?: Position,
): Promise<Shots> {
  await page.goto(url);
  if (moveFrameTo) await moveTo(page, moveFrameTo);
  const frame = page.locator(selector);
  const state = await settle(page, frame);
  const position = await positionOf(frame);
  const withImages = await shoot(page, frame);
  await hideImages(page);
  const layout = await shoot(page, frame);
  return { state, position, withImages, layout };
}

/**
 * 基准图（expected）、站点截图（actual）、差异图（diff）都写进 test-results/ 里这条测试的文件夹，
 * 并挂到报告上：按这三个后缀起名，报告里能左右对照着看。
 */
async function keep(
  testInfo: TestInfo,
  pass: string,
  expected: Bitmap,
  actual: Bitmap,
  diff: Difference,
): Promise<void> {
  const images = { expected, actual, diff: diff.image };
  for (const [kind, bitmap] of Object.entries(images)) {
    const name = `${pass}-${kind}.png`;
    const png = toPng(bitmap);
    await writeFile(testInfo.outputPath(name), png);
    await testInfo.attach(name, { body: png, contentType: 'image/png' });
  }
}

for (const screen of SCREENS) {
  test(screen.name, async ({ context }, testInfo) => {
    const traffic = await serveFromDisk(context);

    // 先截站点：要知道这一屏在整页里的位置，基准图渲染在同一个位置上
    const sitePage = await context.newPage();
    const site = await capture(
      sitePage,
      `${SITE_ORIGIN}${screen.path}`,
      screen.selector,
    );
    await sitePage.close();

    const designPage = await context.newPage();
    const design = await capture(
      designPage,
      `${DESIGN_ORIGIN}/screens/${screen.name}.html`,
      DESIGN_FRAME,
      site.position,
    );
    await designPage.close();

    // 确认两边都是在该有的状态下截的图，不然比出来的数字没有意义
    for (const [side, { state }] of [
      ['设计稿', design],
      ['站点', site],
    ] as const) {
      expect
        .soft(state.interTightFaces, `${side}：Inter Tight 没有加载`)
        .toBeGreaterThan(0);
      expect.soft(state.failedFonts, `${side}：有字体加载失败`).toEqual([]);
      expect.soft(state.brokenImages, `${side}：有图片没加载出来`).toEqual([]);
      expect
        .soft(state.movingVideos, `${side}：视频没有停在封面上`)
        .toEqual([]);
    }
    expect
      .soft(design.position, '基准图没有渲染在和站点相同的位置上')
      .toEqual(site.position);
    expect.soft(traffic.external, '请求了站外地址').toEqual([]);
    expect.soft(traffic.missing, '请求的文件不存在').toEqual([]);

    const layout = compare(design.layout, site.layout, LAYOUT.tolerance);
    const withImages = compare(
      design.withImages,
      site.withImages,
      WITH_IMAGES.tolerance,
    );
    await keep(testInfo, 'layout', design.layout, site.layout, layout);
    await keep(
      testInfo,
      'with-images',
      design.withImages,
      site.withImages,
      withImages,
    );

    const numbers: ScreenNumbers = {
      screen: screen.name,
      layout: {
        differing: layout.differing,
        ratio: layout.ratio,
        maxDelta: layout.maxDelta,
        maxPixels: LAYOUT.maxPixels,
      },
      withImages: {
        differing: withImages.differing,
        ratio: withImages.ratio,
        maxDelta: withImages.maxDelta,
        maxRatio: screen.maxRatioWithImages,
      },
    };
    await testInfo.attach(NUMBERS_ATTACHMENT, {
      body: JSON.stringify(numbers),
      contentType: 'application/json',
    });

    expect
      .soft(
        layout.differing,
        `藏起图片后（版式、文字、色块），有 ${layout.differing} 个像素和设计稿差得超过 ${LAYOUT.tolerance}` +
          `（最大差值 ${layout.maxDelta}），上限 ${LAYOUT.maxPixels} 个。看 layout-diff.png`,
      )
      .toBeLessThanOrEqual(LAYOUT.maxPixels);
    expect
      .soft(
        withImages.ratio,
        `带图片比，${percent(withImages.ratio)} 的像素和设计稿差得超过 ${WITH_IMAGES.tolerance}，` +
          `上限 ${percent(screen.maxRatioWithImages)}。看 with-images-diff.png`,
      )
      .toBeLessThanOrEqual(screen.maxRatioWithImages);
  });
}
