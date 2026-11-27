import designCss from '../design/tokens.css?raw';
import siteCss from '../src/styles/tokens.css?raw';
import { describe, expect, it } from 'vitest';

// src/styles/tokens.css 是 design/tokens.css 的照抄。交接包改了数值而这里没跟上，
// 或者有人在这里自己改了数值，这个测试都会失败。比较时忽略空白和换行（Prettier 会重排长的值）。
function customProperties(source: string): Map<string, string> {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const properties = new Map<string, string>();
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    properties.set(
      match[1]!,
      match[2]!
        .replace(/\s+/g, ' ')
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')
        .trim(),
    );
  }
  return properties;
}

describe('设计规范变量', () => {
  const design = customProperties(designCss);
  const site = customProperties(siteCss);

  it('交接包里有变量（防止读错文件导致空比空）', () => {
    expect(design.size).toBeGreaterThan(40);
  });

  it('站点的每个变量和 design/tokens.css 完全一致，不多不少', () => {
    expect(Object.fromEntries(site)).toEqual(Object.fromEntries(design));
  });

  it('首屏大字的反色样式也照抄了', () => {
    expect(siteCss).toContain('.hero-word');
    expect(siteCss).toContain('mix-blend-mode: difference');
  });
});
