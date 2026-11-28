// @ts-check
import { defineConfig } from 'astro/config';
import { imageChecks } from './src/media/integration.ts';

// 纯静态输出。部署（S-02）和表单接口（S-03）各自的 issue 再改这里。
// imageChecks：构建完检查首屏图片体积和图片管线（P-05，见 docs/media.md）。
export default defineConfig({
  output: 'static',
  integrations: [imageChecks()],
});
