// @ts-check
import { defineConfig } from 'astro/config';
import { imageChecks } from './src/media/integration.ts';
import { launchBasics } from './src/seo/integration.ts';

// 纯静态输出。部署（S-02）和表单接口（S-03）各自的 issue 再改这里。
// imageChecks：构建完检查首屏图片体积和图片管线（P-05，见 docs/media.md）。
// launchBasics：构建完检查每页的标题、描述和分享卡片，生成 sitemap.xml 和 robots.txt（P-06，见 docs/launch-basics.md）。
export default defineConfig({
  output: 'static',
  integrations: [imageChecks(), launchBasics()],
});
