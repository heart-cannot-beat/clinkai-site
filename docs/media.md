# 示例图片和视频的线上管线

站点上的示例图片和视频（全部是 AI 生成、品牌和人物都虚构的示例素材）怎么从设计交接包进到页面上。代码在 `src/media/`。

## 文件

| 路径                              | 内容                                                                                                                           |
| :-------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| `src/assets/img/`                 | 43 张示例图：图片清单里有屏在用的那些，从 `design/assets/img/` 原样拷来，逐字节一致（测试守着）。站点构建不读 `design/` 里的图 |
| `src/assets/video/`               | 达人示例视频的 webm 和 mp4，从 `design/assets/video/` 原样拷来                                                                 |
| `src/media/catalog.ts`            | 按文件名取图片（宽高、格式）和视频地址                                                                                         |
| `src/media/responsive.ts`         | 每张图出哪几种宽度、显示多大、`sizes` 怎么写                                                                                   |
| `src/media/picture.ts`            | 构建时出图（AVIF 和 WebP、多尺寸），拼 `<picture>`。版本墙和组件都走这里                                                       |
| `src/media/ExampleImage.astro`    | 示例图组件                                                                                                                     |
| `src/media/ExampleVideo.astro`    | 示例视频组件，带播放规则和退路                                                                                                 |
| `src/media/hero.ts`               | 首屏叠板上的三张图和它们的显示大小，和 `design/screens/01-hero.html` 对照                                                      |
| `src/media/budget.ts`             | 首屏图片体积上限，以及检查构建产物里图片的规则                                                                                 |
| `src/media/integration.ts`        | 构建检查：`astro build` 写完 `dist/` 后跑，不合格就让构建失败                                                                  |
| `src/pages/media.astro`（/media） | 示例素材陈列页：每张图、版本墙、视频都摆在上面，给开发和设计核对。不进导航，不让搜索引擎收录                                   |

## 哪些素材进站点

以 `design/assets/manifest.json` 为准，测试会比对：

- **`usedIn` 不为空的才进站点。** 清单的规则是「`usedIn` 为空的图现在没有任何一屏在用，不用进线上」。这样的图不拷进 `src/assets/`，构建产物里也就没有它。现在清单里有 44 张图，43 张在用；没人用的一张是 `pebble_cut_top.webp`。
- `src/assets/` 里不能有清单以外的文件。
- 达人素材（`kind` 是 `creator-…`）只能出现在达人屏和产品页的达人列表里；版本墙的测试会拦住它们进墙。

## 图片

用 Astro 自带的图片处理（`astro:assets` 的 `getImage`，底下是 sharp，随 Astro 一起装，没有另加依赖）。构建时出图，文件名带内容哈希，输出到 `dist/_astro/`。原图不进构建产物。

- **格式：** `<source type="image/avif">` 在前，`<img>` 本身是 WebP。WebP 在微信内置浏览器和 Safari 14 以上都能用，所以不再出 JPEG。压缩质量用 Astro 的默认值（sharp 的默认：WebP 80、AVIF 50）。
- **尺寸：** 每张图按 320、640、960、1280 里比原图窄的几档出，再加原图宽度本身，不放大；和原图宽度差不到 15% 的那档不出。原图本身很小（256 的头像）时出一半宽和原宽。每张图至少两档，测试守着。
- **按显示大小挑：** `sizes` 按图在 1440 宽设计稿上显示的宽度写，例如 381 像素宽的图是 `(min-width: 1440px) 26.46vw, 381px`：视口不小于 1440 时假定画布等比放大，更窄时假定画布不缩小。用 `object-fit: cover` 铺满一个框的图，按它实际铺开的宽度算（原图比框扁时比框宽）。
- **按需加载：** 默认 `loading="lazy"`、`decoding="async"`。只有首屏的图加 `priority`：`loading="eager"`、`fetchpriority="high"`。
- **同一张图只处理一次：** 每张图的几组地址和用在哪、显示多大无关，构建时只转一次，版本墙和别处用同一套文件。

```astro
---
import ExampleImage from '../media/ExampleImage.astro';
---

<!-- 宽高是图在 1440 宽设计稿上显示的大小（像素，算上缩放）；给了 height 就按 cover 算 -->
<ExampleImage
  file="acme_moon.jpg"
  width={381}
  height={381}
  priority
  class="board-image"
/>
<ExampleImage
  file="pebble_cut_pair.webp"
  width={124}
  style="position: absolute; left: 8px"
/>
```

外层是 `<picture>`（行内元素），`class`、`style` 都落在里面的 `<img>` 上。图要直接参加 flex 或 grid 排版时，给 `picture` 设 `display: contents`。

`alt` 默认是空的：示例图在页面上大多是装饰，说明写在外层（比如整面墙的 `aria-label`）。需要的时候照 `design/copy.md` 传 `alt`。

版本墙在构建时拼 HTML（`src/wall/`），所以它不用组件，而是调 `pictureHtml`；组件和墙的属性来自同一个 `pictureAttributes`。

## 首屏图片的体积上限：200 KB

**规则：** 每个页面里不延迟加载的图片（没有 `loading="lazy"` 的 `<img>`）加起来不超过 200 KB。

**怎么量：** 按设计稿的 1440 宽、2 倍屏，从 `srcset` 和 `sizes` 算出浏览器会挑哪个文件；`<picture>` 里每种格式各挑一个，取最重的那个（不支持 AVIF 的浏览器下 WebP）。量的是 `dist/` 里真实的文件大小。

**怎么定的：** Lighthouse 模拟手机网络的下行速度是 1.6 Mbps，约 200 KB/s；首屏的图要在一秒钟内下完。

**现在是多少：** 首屏叠板上的三张（`acme_moon.jpg`、`ugc_dawn.jpg`、`dew_dots.jpg`，各按 381 像素见方显示）：

| 格式           | 合计     | 说明                                     |
| :------------- | :------- | :--------------------------------------- |
| AVIF           | 82.3 KB  | 现在的浏览器拿到的                       |
| WebP（按它算） | 153.2 KB | 最重的情况，离上限还有约 47 KB           |
| 原图           | 241.9 KB | 不经管线、直接用交接包里的 JPEG 时的大小 |

**检查在哪：** `astro build` 的最后一步（`src/media/integration.ts`），`npm run verify`、CI 和 Cloudflare 的部署构建都会跑到。超了就构建失败，日志里列出每张图挑中的文件和大小。顺带检查每个页面里的每张图都走了图片管线：有 AVIF 的 `<source>`、`<img>` 是 WebP、每种格式至少两个尺寸、写了宽高和 `alt`（SVG 和 `data:` 地址的图不要求）。

超了怎么办：先看是不是有不该立即加载的图忘了延迟加载；确实是首屏的图，就减小显示尺寸或换图。上限要改，在 PR 里写清理由。

首页还没做（P-01）。现在检查跑在示例素材陈列页上：它的首屏就是叠板上的三张，按首屏的大小和 `priority` 输出。首页做好后，同一个检查自动覆盖首页。

## 视频

```astro
---
import ExampleVideo from '../media/ExampleVideo.astro';
---

<figure style="position: relative; width: 428px; height: 760px">
  <ExampleVideo
    name="creator-pebble"
    poster="ugc_pebble.jpg"
    posterAlt="（照抄 design/copy.md）"
    label="（照抄 design/copy.md）"
    width={428}
    height={760}
  />
</figure>
```

- `<source>` 先 webm（VP9）、再 mp4（H.264），两个都带。视频文件原样打包，不转码。
- 永远静音：`muted`，脚本里也设一次 `muted = true`，不显示控制条。两个文件里都只有一条画面轨道、没有声轨，测试按字节检查容器里的轨道类型。mp4 的索引在数据前面，下载一点就能开始播。
- 播放规则照 `design/motion.md` 04 屏：`preload="none"`，露出一半才加载并从头播放，离开就暂停。
- 退路：视频下面垫一张同样大小的封面图（走图片管线，延迟加载）。视频真正开始播放之前是透明的，所以系统开了「减少动态效果」、手机上、加载失败、浏览器不让自动播放时，看到的都是封面图。
- 「手机」先按 `(max-width: 767px)` 算（`src/media/video.ts`）。手机稿（P-02）定了以后和滚动动效的手机退路统一。

## 设计侧重新导出之后

图片或视频换了、加了，`npm run test` 里逐字节对照的测试会挂。按下面的顺序同步：

1. 对照 `design/assets/manifest.json`：把变了的、新加的文件从 `design/assets/img/`、`design/assets/video/` 拷到 `src/assets/img/`、`src/assets/video/`。只拷 `usedIn` 不为空的；`usedIn` 变成空的，从 `src/assets/` 里删掉。
2. 版本墙直接读 `design/wall/tiles.json`，墙里用到的图只要在 `src/assets/img/` 里就行（见 `docs/version-wall.md`）；首屏叠板的图换了，同步 `src/media/hero.ts`。
3. 跑 `npm run verify`：测试、首屏体积上限和图片管线检查都过了才算同步完。

不改 `design/`。交接包里的图有问题，在 Issue 里报。
