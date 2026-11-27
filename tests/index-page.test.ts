import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import IndexPage from '../src/pages/index.astro';

describe('首页', () => {
  it('能渲染出中文文档骨架', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(IndexPage);

    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('<title>ClinkAI</title>');
  });
});
