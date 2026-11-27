/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// 用 Astro 的 Vite 配置跑测试，这样测试里能直接渲染 .astro 组件
export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
