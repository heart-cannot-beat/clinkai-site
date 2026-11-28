import { defineConfig } from '@playwright/test';
import { VIEWPORT } from './tests/visual/screens';

// 截图对比（P-07）：站点的每一屏和 design/screens/ 里的设计稿逐像素比。说明见 docs/visual-compare.md。
// 不起服务器：页面和素材都由 tests/visual/routes.ts 从磁盘上答，所以要先构建（npm run test:visual 会先构建）。
export default defineConfig({
  testDir: 'tests/visual',
  // *.test.ts 是 Vitest 的单元测试，不归这里跑
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results',
  forbidOnly: Boolean(process.env.CI),
  // 比的是确定的画面，失败了重跑也不该通过
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['./tests/visual/reporter.ts'],
  ],
  use: {
    browserName: 'chromium',
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'zh-CN',
    // 「减少动态效果」下站点显示静态帧，设计稿的每个文件也是静态的那一帧
    reducedMotion: 'reduce',
  },
});
