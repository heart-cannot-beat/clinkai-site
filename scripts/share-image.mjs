// 生成分享图 public/share/clinkai.png（P-06）。用法：
//
//   node scripts/share-image.mjs
//
// 图上只有标志：纸色底，正中是页头那个标志（CLINKAI 加一个墨色圆点）放大后的样子。
// 颜色读 src/styles/tokens.css，字体用站点自托管的 Inter Tight，尺寸读 src/seo/site.ts。
// 用本机的 Chrome 无界面截图，不在构建和 CI 里跑：生成的 PNG 提交进仓库。
// Chrome 不在默认位置时用环境变量 CHROME_PATH 指过去（Chromium 系的浏览器都行）。
// 需要 Node 22.18 以上（直接读 .ts 文件）。说明见 docs/launch-basics.md。

import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LOGO_TEXT } from '../src/data/site.ts';
import { SHARE_IMAGE } from '../src/seo/site.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const chrome =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const tokens = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8');
function token(name) {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(tokens);
  if (!match) throw new Error(`tokens.css 里没有 ${name}`);
  return match[1].trim();
}

const font = pathToFileURL(
  join(
    root,
    'node_modules/@fontsource/inter-tight/files/inter-tight-latin-400-normal.woff2',
  ),
).href;

// 标志照页头的比例放大（src/components/SiteHeader.astro：字号 24px 时圆点 9px、间距 3px、字距 -0.01em）。
// 132px 时整个标志宽约 550px：平台把图裁成正方形（取中间 630×630）时标志还是完整的。
const SIZE = 132;
const { width, height } = SHARE_IMAGE;

const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<style>
@font-face {
  font-family: 'Inter Tight';
  font-weight: 400;
  src: url('${font}') format('woff2');
}
html, body { margin: 0; }
body {
  width: ${width}px;
  height: ${height}px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${token('--paper')};
  color: ${token('--ink')};
}
.logo {
  display: flex;
  align-items: baseline;
  gap: ${(SIZE * 3) / 24}px;
  font-family: 'Inter Tight';
  font-weight: 400;
  font-size: ${SIZE}px;
  line-height: 1;
  letter-spacing: -0.01em;
}
.dot {
  width: ${(SIZE * 9) / 24}px;
  height: ${(SIZE * 9) / 24}px;
  border-radius: 50%;
  background: ${token('--ink')};
}
</style>
<div class="logo"><span>${LOGO_TEXT}</span><span class="dot"></span></div>
</html>
`;

const work = mkdtempSync(join(tmpdir(), 'clinkai-share-'));
const output = join(root, 'public', SHARE_IMAGE.path);
try {
  const page = join(work, 'card.html');
  writeFileSync(page, html);
  mkdirSync(dirname(output), { recursive: true });
  execFileSync(
    chrome,
    [
      '--headless=new',
      // 用临时的用户目录，不碰正在用的 Chrome
      `--user-data-dir=${join(work, 'profile')}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${width},${height}`,
      // 等字体加载完再截
      '--virtual-time-budget=5000',
      `--screenshot=${output}`,
      pathToFileURL(page).href,
    ],
    { stdio: 'ignore' },
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}

// PNG 文件头里的宽高（第 16–23 字节）：截出来的尺寸不对就报错
const png = readFileSync(output);
const actual = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
if (actual.width !== width || actual.height !== height) {
  throw new Error(
    `截出来是 ${actual.width}×${actual.height}，应该是 ${width}×${height}`,
  );
}
console.log(
  `${SHARE_IMAGE.path}：${width}×${height}，${(png.length / 1024).toFixed(1)} KB`,
);
