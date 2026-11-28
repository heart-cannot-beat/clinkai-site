import { unstable_readConfig } from 'wrangler';
import { describe, expect, it } from 'vitest';
import devVarsExample from '../.dev.vars.example?raw';
import astroConfig from '../astro.config.mjs';
import {
  REQUIRED_CONFIG,
  RETRY_AFTER_SECONDS,
} from '../src/worker/contact/handler';

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

describe('wrangler.jsonc：表单接口（S-03）', () => {
  // 接口要的配置只有收发件地址（Turnstile 已经拿掉，见 Issue #15）
  const SECRET_NAMES = ['CONTACT_TO', 'CONTACT_FROM'];

  it('接口要的配置就是这两个，.dev.vars.example 里也只列这两个', () => {
    const exampleNames = [...devVarsExample.matchAll(/^([A-Z_]+)=/gm)].map(
      (match) => match[1],
    );

    expect([...REQUIRED_CONFIG]).toEqual(SECRET_NAMES);
    expect(exampleNames).toEqual(SECRET_NAMES);
  });

  it('.dev.vars.example 里只有虚构的 *.example 地址', () => {
    const values = [...devVarsExample.matchAll(/^[A-Z_]+="([^"]*)"/gm)].map(
      (match) => match[1],
    );

    expect(values).toHaveLength(SECRET_NAMES.length);
    for (const value of values) expect(value).toMatch(/@[a-z.-]+\.example$/);
  });

  it('Worker 脚本是 src/worker/index.ts，只有 /api/* 先进 Worker', () => {
    // wrangler 读出来的 main 是绝对路径
    const main = (config.main ?? '').replaceAll('\\', '/');
    expect(main.endsWith('/src/worker/index.ts')).toBe(true);
    expect(config.assets?.run_worker_first).toEqual(['/api/*']);
  });

  it('绑定名和 Worker 代码（src/worker/env.ts）里用的一致', () => {
    expect(config.assets?.binding).toBe('ASSETS');
    expect(
      config.send_email.map((binding: { name: string }) => binding.name),
    ).toEqual(['EMAIL']);
    expect(
      config.ratelimits.map((binding: { name: string }) => binding.name),
    ).toEqual(['CONTACT_RATE_LIMITER']);
  });

  it('限流周期和 429 响应里的 Retry-After 一致', () => {
    expect(config.ratelimits[0]?.simple.period).toBe(RETRY_AFTER_SECONDS);
  });

  it('发信绑定不加 remote：本地 wrangler dev 只模拟发信', () => {
    for (const binding of config.send_email) {
      expect(binding.remote).toBeFalsy();
    }
  });

  it('预览不配发信绑定：PR 预览不会往真实邮箱发信', () => {
    expect(config.previews?.send_email ?? []).toEqual([]);
  });

  it('收发件地址不写进配置', () => {
    for (const name of SECRET_NAMES) {
      expect(config.vars).not.toHaveProperty(name);
      expect(config.previews?.vars ?? {}).not.toHaveProperty(name);
    }
    for (const binding of config.send_email) {
      expect(binding.destination_address).toBeUndefined();
      expect(binding.allowed_destination_addresses).toBeUndefined();
    }
  });
});
