/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// 用 Astro 的 Vite 配置跑测试，这样测试里能直接渲染 .astro 组件
export default getViteConfig({
  test: {
    // 默认 Vitest 把 CSS 导入换成空字符串；部件陈列页要读 tokens.css 的原文（?raw）
    css: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
