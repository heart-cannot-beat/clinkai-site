# 版本墙生成器

首页第 2 屏铺满全屏的示例广告小图（现在是 40 张），以及第 3 屏背后那面灰墙，是同一份数据。它在构建时由 `src/wall/` 生成，页面上只有静态 HTML：线上不跑生成逻辑，不调用任何 AI 接口。

生成器移植自设计交接包的 `design/wall/generate_wall.py`，产出以 `design/wall/tiles.json` 为准。

## 文件

| 路径                         | 内容                                                                                            |
| :--------------------------- | :---------------------------------------------------------------------------------------------- |
| `src/wall/config.ts`         | 变体配置：格子和随机种子、候选尺寸、底色、各语言的标题、图片、每种尺寸轮流套的模板              |
| `src/wall/templates.ts`      | 每个模板里图片和文字摆在哪                                                                      |
| `src/wall/generate.ts`       | `packGrid` 用固定种子切格子，`generateWall` 生成小图并数出三个计数，`renderWallTiles` 输出 HTML |
| `src/wall/python-compat.ts`  | 和 Python 一致的随机数序列（MT19937）和取整。没有它，同一个种子切出来的格子就和设计稿不一样     |
| `src/wall/images.ts`         | 把图片文件名换成站点上的地址                                                                    |
| `src/wall/index.ts`          | `versionWall`：站点上的那面墙，构建时生成一次                                                   |
| `src/wall/VersionWall.astro` | 输出整面墙的组件                                                                                |
| `src/assets/wall/`           | 墙里用到的图片，从 `design/assets/img/` 原样拷来。全部是虚构品牌 Pebblesound 的 AI 生成示例     |

## 怎么用

```astro
---
import VersionWall from '../wall/VersionWall.astro';
import { versionWall } from '../wall';

const { versions, languages, sizes } = versionWall.counts; // 现在是 40、7、4
---

<VersionWall />
<!-- 第 3 屏的灰墙：只当背景，对读屏软件隐藏 -->
<VersionWall decorative />
```

- **计数不手写。** 计数块里的版本数、语言数、尺寸数读 `versionWall.counts`，它是从生成结果里数出来的。
- **坐标是设计稿 1440×900 画布上的像素。** 组件只输出小图和一层 `position: absolute; inset: 0` 的容器；深色底、字体、层级、缩放由所在的屏负责。手机上怎么排要等手机稿。
- **「示例」必须标。** 组件的无障碍说明以「示例：」开头；计数块里那行文案末尾的「· 示例」由所在的屏照 `design/copy.md` 写上。

## 规则

- 墙里只有广告图片和产品图，**没有达人素材**。`design/assets/manifest.json` 里 `kind` 是 `creator-…` 的图和视频不能进墙，测试会拦住。
- 只用图片清单里虚构品牌的示例素材，不放真实客户的东西。
- 不改文案和设计。标题、底色、位置都以交接包为准。

## 设计侧重新导出之后

`design/wall/tiles.json` 变了，`npm run test` 里对照它的测试就会挂。按下面的顺序同步：

1. 对照 `design/wall/generate_wall.py` 的改动，改 `src/wall/config.ts`（数据）或 `src/wall/templates.ts`（位置）。
2. 图片换了或加了，把 `design/assets/img/` 里对应的文件拷到 `src/assets/wall/`，并在 `config.ts` 里登记。
3. 跑 `npm run test`，直到生成的 40 张和 `tiles.json`、`design/screens/02-wall.html` 一字不差。

代码和交接包对不上、又不是移植的问题时，在 Issue 里报，不要改 `design/`，也不要在代码里绕过去。
