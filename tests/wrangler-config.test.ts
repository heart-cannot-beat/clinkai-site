import { unstable_readConfig } from 'wrangler';
import { describe, expect, it } from 'vitest';
import astroConfig from '../astro.config.mjs';

// 用 wrangler 自己的读取器解析 wrangler.jsonc：字段写错、格式不对，这里就会报错。
// 路径相对仓库根目录（npm run test 在根目录跑 Vitest）。
const config = unstable_readConfig({ config: 'wrangler.jsonc' });

describe('wrangler.jsonc', () => {
  it('托管的正是 Astro 构建输出的目录', () => {
    const outDir = astroConfig.outDir ?? './dist';
    expect(config.assets?.directory).toBe(outDir);
  });

  it('先只挂在 workers.dev 上，不绑任何自定义域名（切 clinkai.app 是 L-01）', () => {
    expect(config.workers_dev).toBe(true);
    expect(config.route).toBeUndefined();
    expect(config.routes).toBeUndefined();
  });

  it('有 previews 块：PR 预览跑的 `wrangler preview` 没有它会直接失败', () => {
    expect(config.previews).toBeDefined();
  });

  it('明确打开预览地址：不写的话 `wrangler deploy` 不会去改 Worker 上现有的开关', () => {
    expect(config.preview_urls).toBe(true);
  });

  it('不把账号 ID 写进仓库', () => {
    expect(config.account_id).toBeUndefined();
  });
});
