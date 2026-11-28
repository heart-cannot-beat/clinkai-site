# 上线基础（P-06）

每个页面的标题、描述和分享卡片，站点地图和 `robots.txt`，404 页，隐私说明页。代码在 `src/seo/`，页面的文字在 `src/data/`。

**访问统计在另一份文档里：** [docs/analytics.md](analytics.md)。

## 站点地址只写在一处

`src/seo/site.ts` 的 `SITE_URL`。分享卡片、canonical、站点地图和 `robots.txt` 里的完整地址都从它拼，别处不写域名。

- 现在是 `https://clinkai.app`（`CLAUDE.md` 里定的正式域名）。域名还没切（L-01）；切的时候域名有变，只改这一行。
- **不要写 workers.dev 地址。** 账号子域名是个人信息（`CLAUDE.md`「公开仓库」）。构建时会检查每个页面的 `<head>`，出现 `workers.dev` 就失败。
- 域名切过去之前，线上（workers.dev）页面里的 canonical 和分享图地址指向的是还没生效的正式域名：分享图的地址要等域名生效才打得开。

## 每个页面的标题、描述和分享卡片

都由 `src/layouts/BaseLayout.astro` 写进 `<head>`，页面只传两样：

| 属性          | 说明                                                                                                                    |
| :------------ | :---------------------------------------------------------------------------------------------------------------------- |
| `title`       | 页面标题。子页面照设计稿的写法：「ClinkAI」加页面名，比如 `ClinkAI 预约沟通`                                            |
| `description` | 描述，显示在搜索结果和分享卡片上。**照抄 `design/copy.md`，不要自己写。** 不传时用首屏的那一句（`DEFAULT_DESCRIPTION`） |
| `noindex`     | 不希望被收录的页面设为 `true`（部件陈列页、素材陈列页、404 页）                                                         |

BaseLayout 据此写出：`<title>`、描述、canonical、Open Graph（`og:type`、`og:site_name`、`og:locale`、`og:title`、`og:description`、`og:url`、`og:image` 和它的宽高）、Twitter Card（`summary_large_image`）。标了 `noindex` 的页面不写 canonical 和 `og:url`。

现在各页用的文案：

| 页面                 | 标题                 | 描述                                                   | 出处                                  |
| :------------------- | :------------------- | :----------------------------------------------------- | :------------------------------------ |
| `/`                  | `ClinkAI`            | 首屏的中文说明（两行连成一句）                         | `design/copy.md`「01 首屏」           |
| `/contact/`          | `ClinkAI 预约沟通`   | 这一页标题下面的介绍                                   | `design/copy.md`「子页面 · 预约沟通」 |
| `/privacy/`          | `ClinkAI 隐私说明`   | 草稿                                                   | `src/data/privacy.ts`，交接包里没有   |
| 404                  | `ClinkAI 页面不存在` | 草稿                                                   | `src/data/not-found.ts`，交接包里没有 |
| `/parts/`、`/media/` | 各自的内部标题       | 没有自己的，用首屏那一句（这两页不收录，不是站点文案） |                                       |

**新加一个页面：** 套 BaseLayout，传 `title` 和（照抄 `copy.md` 的）`description`，就自动有分享卡片、进站点地图。不想被收录就加 `noindex`，它会自动从站点地图里拿掉、写进 `robots.txt`。不用改 `src/seo/` 里的任何东西。

## 分享图

全站共用一张：`public/share/clinkai.png`，1200×630，纸色底上一个标志。图上没有示例素材，所以不用标「示例」。地址不带哈希（分享平台会缓存这个地址），换图时文件名不变，或者改 `src/seo/site.ts` 的 `SHARE_IMAGE`。

交接包里没有分享图，这一张是按设计规范生成的草稿，等设计侧给正式的。重新生成：

```sh
node scripts/share-image.mjs
```

脚本读 `src/styles/tokens.css` 的颜色和站点自托管的 Inter Tight，用本机的 Chrome 无界面截图（不在默认位置时用环境变量 `CHROME_PATH` 指过去），生成的 PNG 提交进仓库。它不在构建和 CI 里跑。

没有在微信、领英这些平台里实际转发验证过：正式域名生效前，分享图的地址打不开。

## 站点地图和 robots.txt

构建时生成，不是手写的文件：`astro build` 写完 `dist/` 之后，`src/seo/integration.ts` 把每个页面的 `<head>` 读一遍，写出 `dist/sitemap.xml` 和 `dist/robots.txt`。本地开发服务器（`npm run dev`）里没有这两个文件，要看就 `npm run build` 之后看 `dist/`，或者 `npx wrangler dev`。

- **站点地图：** 只列会被收录的页面，带完整地址。标了 `noindex` 的页面和 404 页不进。现在是 `/`、`/contact/`、`/privacy/`。
- **robots.txt：** 不让抓 `/api/`（表单接口）和标了 `noindex` 的页面（现在是 `/parts/`、`/media/`），其余放开，最后一行指出站点地图。
- 页面收不收录只看它自己的 `noindex`，没有另外维护的名单。
- 被 `robots.txt` 拦住的页面，搜索引擎抓不到页面上的 `noindex` 标记；要是别的网站链接了它，地址本身仍可能出现在搜索结果里（没有内容）。这两页没有任何站内链接指过去，现在两层都留着。

## 404 页

`src/pages/404.astro`，构建成 `dist/404.html`。`wrangler.jsonc` 的 `not_found_handling: "404-page"` 让 Cloudflare 在找不到路径时返回它，状态码 404。`/api/` 下找不到的路径不走这里，由 Worker 返回 JSON。

本地看：`npm run build && npx wrangler dev`，打开一个不存在的地址。

## 隐私说明页

`src/pages/privacy.astro`，地址 `/privacy/`，文字在 `src/data/privacy.ts`。

- **页面现在没有入口。** 设计稿里没有放隐私说明链接的位置（没有页脚），所以它只在站点地图里，要知道地址才打得开。入口放哪等设计侧定（Issue #17）；预约沟通表单旁边那句隐私说明（`CONTACT_COPY.privacy`，Issue #15）也还没有文案。
- **只写查得到的事实。** 每一句的出处写在 `src/data/privacy.ts` 开头。表单收哪几项不手写，从接口的字段表生成：月预算的分档补齐后会自动出现在这一页。
- **站点的做法变了要先改这一页。** `tests/privacy-page.test.ts` 盯着几件事：站点代码不读写 cookie；统计用的绑定只有记访问的那一个，页面上列的访问记录内容就是记数接口约定里的那几项；`wrangler.jsonc` 里没有存储类的绑定。访问记录多记一项、加存储的那一单会让这些测试失败，这是有意的：改测试的同时把说明改对。

## 没有设计稿的两页长什么样

404 和隐私说明在交接包里没有稿子。两页共用 `src/layouts/TextPage.astro`，照子页面的结构搭：普通页头、左上的英文大标题（字号、字距照「关于我们」）、标题下面一段中文、角落部件；只用 `tokens.css` 现有的变量。窄屏的做法和预约沟通页一样（单列、标题按屏宽缩小），也是暂定的。设计稿到了按稿子改。

## 构建检查

`npm run build`（`npm run verify` 的最后一步）会在下面这些情况失败，报错里写明是哪个页面、缺什么：

- 有页面没有 `<title>`、没有描述，或者分享卡片的标签不全；
- 分享图的地址不是 `SITE_URL` 下的完整地址，或者 `public/` 下没有这张图；
- 会被收录的页面，canonical 或 `og:url` 不是它自己在正式域名下的地址；
- `<head>` 里出现了 workers.dev 地址；
- 没有 `404.html`。

套了 BaseLayout 的页面都过得了。同一套规则在 `tests/page-meta.test.ts` 里也跑一遍：它把 `src/pages/` 下的每个页面渲染出来检查，不用等到构建。

## 草稿和没定的事

都记在 Issue #17：404 页和隐私说明页的文案（草稿）、这两页和分享图的设计、隐私说明页的入口、首页标题要不要加一句。
