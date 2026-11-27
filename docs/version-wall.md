# 版本墙

首页第 2 屏的示例广告小图（现在是 40 张），以及第 3 屏背后那面灰墙，是同一份数据。

墙是设计侧手排的：版面、底色、标题、每张用哪张图，都定在交接包的 `design/wall/tiles.json` 里。站点构建时由 `src/wall/` 直接读这份数据，把里面的图片换成站点图片管线的输出，再输出静态 HTML。线上不跑生成逻辑，不调用任何 AI 接口。

站点不重新排版，也不移植 `design/wall/generate_wall.py`：那是设计侧生成 `tiles.json` 的脚本。

## 文件

| 路径                         | 内容                                                                                                                          |
| :--------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| `src/wall/wall.ts`           | `buildWall` 读定稿数据、把每张图交给调用方画、数出三个计数；`renderWallTiles` 输出 HTML                                       |
| `src/wall/index.ts`          | `versionWall`：站点上的那面墙，构建时读一次。图片走站点的图片管线（`docs/media.md`）                                          |
| `src/wall/VersionWall.astro` | 输出整面墙的组件                                                                                                              |
| `src/wall/test-helpers.ts`   | 只给测试用：从设计稿里取对照用的基准                                                                                          |
| `src/assets/img/`            | 图片，和站点上别的示例图放在一起，从 `design/assets/img/` 原样拷来。墙里用到 25 张，全部是虚构品牌 Pebblesound 的 AI 生成示例 |

## 怎么用

```astro
---
import VersionWall from '../wall/VersionWall.astro';
import { versionWall } from '../wall';

const { versions, languages, sizes } = versionWall.counts; // 现在是 40、7、4
---

<VersionWall />
<!-- 第 3 屏的灰墙：只当背景，对读屏软件隐藏，少了胜出的那一张 -->
<VersionWall decorative />
```

- **计数不手写。** 计数块里的版本数、语言数、尺寸数读 `versionWall.counts`，它是从数据里数出来的：版本数是小图的张数，语言数是 `language` 去重后的个数（没有标题的小图不算），尺寸数是 `ratio` 去重后的个数。`tiles.json` 自带的 `counts` 站点不读，只在测试里拿来核对。
- **坐标是设计稿 1440×900 画布上的像素，墙比画布大。** `left`、`top` 有负数，右边和下边也伸到画布外面，这是设计：由所在的屏用 `overflow: hidden` 裁掉。组件只输出小图和一层 `position: absolute; inset: 0` 的容器；深色底（`#1C1C1B`）、裁切、字体、层级、缩放由所在的屏负责。手机上怎么排要等手机稿。
- **`decorative` 是第 3 屏的灰墙。** 对读屏软件隐藏；不输出 `winner` 为 true 的那一张（右下的钴蓝横幅），它的位置空着，露出深色底。去色变暗（设计稿里是 `filter: grayscale(1) brightness(0.38)`）由第 3 屏加在外面。
- **两张特殊的小图。** `versionWall.tiles` 里保留了 `keyVisual`（中间最大的母版）和 `winner`（被抽出来放大的那一张）两个字段，给第 2、3 屏的滚动动效用。
- **图片走站点的图片管线。** 墙里每张图输出成 `<picture>`：AVIF 在前、WebP 兜底、多尺寸、延迟加载，和别处用同一套文件，见 `docs/media.md`。`sizes` 按图在画布上实际显示的宽度写，宽度从设计稿的内联样式里读：铺满小图的场景图按小图的框算，按像素摆放的产品图用样式里写的宽度。`wall.ts` 本身不管图片怎么输出：`buildWall` 收一个把图画成 HTML 的函数，和设计稿对照的测试用 `plainImage` 画成设计稿里的 `<img>`。
- **「示例」必须标。** 组件的无障碍说明以「示例：」开头；计数块里那行文案末尾的「· 示例」由所在的屏照 `design/copy.md` 写上。

## 规则

- 墙里只有广告图片和产品图，**没有达人素材**。`design/assets/manifest.json` 里 `kind` 是 `creator-…` 的图和视频不能进墙，测试会拦住。
- 小图里的图片只能是设计稿的那一种写法（`<img src alt style>`），地址只能指向交接包的 `assets/img/`。认不出的写法、别的地址、从样式里看不出显示多大，构建都会报错，不会原样输出。
- 只用图片清单里虚构品牌的示例素材，不放真实客户的东西。
- 不改文案和设计。标题、底色、位置都以交接包为准。

## 设计侧重新导出之后

`design/wall/tiles.json` 变了，站点下一次构建就跟着变，一般不用改代码。要做的是：

1. 图片换了或加了：按 `docs/media.md` 的「设计侧重新导出之后」同步 `src/assets/img/`。缺哪张、多哪张、哪张内容对不上，`npm run test` 会指出来。
2. 跑 `npm run test`。它对照的是：输出的小图和 `design/screens/02-wall.html`、`design/screens/03-winner.html` 一字不差（站点上的图换成了 `<picture>`，对照时只忽略图片元素自己的属性，见 `src/wall/VersionWall.test.ts`）；每个位置上是设计稿里的那张图；无障碍说明和 02 屏一致；墙里没有达人素材。
3. 无障碍说明的文案变了：改 `src/wall/wall.ts` 里的 `LABEL`，照抄 `design/copy.md`。
4. `tiles.json` 的字段变了：改 `src/wall/wall.ts` 里的 `DesignTile`。

代码和交接包对不上、又不是同步的问题时，在 Issue 里报，不要改 `design/`，也不要在代码里绕过去。
