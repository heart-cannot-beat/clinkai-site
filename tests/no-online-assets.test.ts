import { describe, expect, it } from 'vitest';

// CLAUDE.md 规则 6：第三方库只能经 npm 打包进站点，不引在线字体地址，不引在线脚本地址。
// design/ 里的稿子为了看稿方便用了谷歌字体的在线地址，站点代码（src/）里不能有。
const FORBIDDEN = [
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /<script[^>]+src=["']https?:/i,
  /<link[^>]+href=["']https?:[^"']+\.css/i,
  /@import\s+(url\()?["']?https?:/i,
];

const sources = import.meta.glob<string>('../src/**/*.{astro,css,ts,js,html}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('站点代码不引在线字体和在线脚本', () => {
  it('src/ 里有文件可查', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
  });

  it.each(Object.entries(sources))('%s', (path, text) => {
    for (const pattern of FORBIDDEN) {
      expect(text, `${path} 匹配到 ${pattern}`).not.toMatch(pattern);
    }
  });
});
