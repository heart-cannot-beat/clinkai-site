// @ts-check
import { defineConfig } from 'astro/config';

// 纯静态输出。部署（S-02）和表单接口（S-03）各自的 issue 再改这里。
export default defineConfig({
  output: 'static',
});
