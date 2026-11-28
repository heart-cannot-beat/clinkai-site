# 访问统计（P-06）

自己记：页面打开时，打包进站点的一小段脚本往我们自己的接口发一条，接口把它写进 Cloudflare 自带的 [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/)。不加载任何外部代码，不用 cookie，不存 IP。做法是用户 2026-11-28 定的（Issue #17）。

代码：约定在 `src/worker/visit/schema.ts`，接口在 `src/worker/visit/handler.ts`，页面脚本在 `src/visit/report.ts`（由 `BaseLayout` 带上），绑定在 `wrangler.jsonc`。

## 记什么

每次打开页面记一条，只有四项（`schema.ts` 的 `VISIT_FIELDS`，顺序就是数据集里 `blob1`–`blob4` 的顺序）：

| 项         | 例子                 | 怎么来的                                                                                       |
| :--------- | :------------------- | :--------------------------------------------------------------------------------------------- |
| 页面路径   | `/contact/`          | 构建时写在页面 `<body>` 上的规范路径，不是地址栏里的地址。不带查询串；404 页一律是 `/404/`     |
| 来源网站   | `www.search.example` | 浏览器给的来源地址，**在浏览器里就只留下域名**，完整地址不发出去。没有来源、站内跳转都记成空的 |
| 国家或地区 | `CN`                 | Cloudflare 按 IP 判断后附在请求上的两位代码（`request.cf.country`）。我们的代码不读 IP         |
| 设备       | `mobile` / `desktop` | 从 User-Agent 粗分：带 `Mobi` 的算手机，其余（平板、认不出的）算电脑。User-Agent 本身不保存    |

## 不记什么

- **不读、不存 IP。** 记数接口的代码里没有读 IP 的地方，有测试盯着。
- **不用 cookie**，页面脚本也不往浏览器里存任何东西，发请求时不带 cookie。
- **不给访客编号。** 所以只有「打开了多少次」，没有「来了多少人」，也看不出同一个人看了哪几页。
- 不记完整的来源地址、查询串、User-Agent 原文、屏幕大小、语言这些。
- 接口不记日志；只有写入出错时记一行错误的名字。

要多记一项（比如「是不是在微信里打开的」），先问用户：改 `VISIT_FIELDS`，隐私说明页会自动多出一行，类型检查会要求给它写说明文字。

## 怎么记的，为什么这样

工单给了两种记法，选的是第一种：

- **选的：页面脚本发到 `POST /api/visit`。** 每打开一次页面，多一次 Worker 请求。统计出了问题（接口挂了、额度用完、被拦截），页面完全不受影响。不跑脚本的访问记不到，大多数爬虫也因此不会算进去。
- **没选：让 Worker 接管所有页面请求，在 Worker 里直接记。** 现在页面请求不经过 Worker，不占额度。改成全部先进 Worker 以后，超过免费额度时这些请求会直接收到 429（[官方说明](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)：「If you exceed your free tier request limits, these requests will receive a 429 (Too Many Requests) response」），也就是网站本身打不开。为了统计冒这个险不值得。

接口的行为：

- 除了方法不对（405），一律回 204、没有内容。记没记上，页面不知道，也不需要知道。
- **只收本站页面发来的**：请求的 `Origin` 要和接口自己的地址同源，内容类型要是 JSON，请求体不超过 1 KB。
- 路径只收站点页面路径那种写法（字母、数字、斜杠、连字符、下划线，最长 96 个字符），不合要求的不记。来源、国家不合要求的记成空的，这一条照记。
- 请求体里多出来的键直接丢掉。

**不算进去的访问：**

- 自报家门的爬虫、无界面浏览器、检测工具（按 User-Agent 认），没有 User-Agent 的请求；
- 不跑脚本的访问；
- 自动化测试和截图用的浏览器（页面脚本看到 `navigator.webdriver` 就不发）；
- **PR 预览**：预览不继承生产的绑定，`wrangler.jsonc` 的 `previews` 里故意没有配，接口拿不到数据集就不记。有测试拦住往 `previews` 里加这个绑定的改动。

**数字不准的地方：**

- 装了拦截插件的访客可能记不到。
- 微信里点开链接通常没有来源，会算在「空的」里，和直接输地址打开的分不开。
- 部件陈列页（`/parts/`）、素材陈列页（`/media/`）也会记，查出来以后自己看着排除。
- 有人直接往接口发假数据是拦不住的（没有按 IP 限流：那样就要用到 IP）。能挡的只有上面那几条格式检查。

## 套餐和限额

官方文档，2026-11-28 核实：

- **Workers Free 套餐能用。** 每天写 10 万个数据点、每天 1 万次查询；并且写明「Currently, you will not be billed for your use of Workers Analytics Engine」。（[价格](https://developers.cloudflare.com/analytics/analytics-engine/pricing/)）
- **数据保留三个月**，再早的查不到。（[限制](https://developers.cloudflare.com/analytics/analytics-engine/limits/)）
- 一个数据点最多 20 个文本列、20 个数字列、1 个索引，索引最长 96 字节。我们用 4 个文本列，索引是页面路径。（同上）
- 写得太快时会抽样，所以查条数要用 `SUM(_sample_interval)`，不能用 `count()`。（[抽样](https://developers.cloudflare.com/analytics/analytics-engine/sampling/)）
- **每次打开页面占一次 Worker 请求。** Workers Free 每天 10 万次请求，和表单接口共用；页面和图片这些静态资源不经过 Worker，不占额度。（[Workers 价格](https://developers.cloudflare.com/workers/platform/pricing/)）
- **一天超过 10 万次打开会怎样：** `/api/` 下的请求收到 429。页面照常打开，但当天剩下的访问记不上，**表单接口也会跟着 429**。到那个量级该换付费套餐了。

## 怎么看数据

没有公开的数据页面。在自己的电脑上跑一个命令，用 Cloudflare 的 [SQL 接口](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/)查：

```sh
export CLOUDFLARE_ACCOUNT_ID=<账号 ID>
export CLOUDFLARE_API_TOKEN=<只读 Token>

node scripts/visits.mjs        # 最近 7 天
node scripts/visits.mjs 30     # 最近 30 天，最多 90
node scripts/visits.mjs --sql  # 只把 SQL 打出来，不联网
```

打出五张表：每天的访问量，按页面、按来源网站、按国家或地区、按设备。

两个环境变量只放在自己的终端里，**不进仓库，不写进 CI**：

1. **账号 ID**：Cloudflare 后台 **Workers & Pages** 页面的 **Account details** 里。
2. **API Token**：后台右上角头像 → **My Profile** → **API Tokens** → **Create Token** → **Create Custom Token**，权限选 **Account** → **Account Analytics** → **Read**，账号范围只选这一个账号。这个 Token 只能读统计数据，不能改任何东西。

按钮名以 Cloudflare 后台当时的界面为准。这是账号设置，由账号的主人来做，agent 不代做。

**这个命令还没有在真实数据上跑过**：写的时候绑定还没部署，也没有 Token。SQL 的写法是照官方文档的例子和函数表写的（[语句](https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/statements/)、[时间函数](https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/date-time-functions/)），第一次跑如果报语法错，把报错贴出来改。

## 需要在 Cloudflare 里做的事

1. **合并后看一眼第一次部署。** 官方文档写的是数据集「在第一次写入时自动创建」，不用在后台先建。文档没提要不要先在后台为账号开通 Analytics Engine；我们没有办法在合并前验证这一点（PR 预览里没有这个绑定）。如果 `main` 上的部署因此失败，线上保持上一个版本不变，按报错里的提示在后台开通，再重新部署。
2. **建只读的 API Token**（见上一节）。只在要看数据时需要，不影响记数。

## PR 预览和本地

- **PR 预览**：没有绑定，不记。
- **`npx wrangler dev`**：绑定是本地模拟的，接口照常回 204，数据点不会写到线上的数据集。本地没有 `request.cf.country` 时国家记成空的。
- **`npm run dev`**（Astro 的开发服务器）：没有 `/api/visit`，页面脚本的请求会失败，脚本不管它，页面照常。

## 测试

`npm run test` 里：

- `src/worker/visit/schema.test.ts`：每一项怎么清洗；爬虫怎么认；查数据的 SQL。
- `src/worker/visit/handler.test.ts`：记下的内容只有四项；没有 IP、cookie 和 User-Agent 原文；不写 cookie；不记日志；绑定缺失时照常回 204、不报错；别的网站发来的、爬虫、格式不对、太大的请求都不记；写入出错不影响响应。
- `src/visit/report.test.ts`：页面脚本只发两项；完整的来源地址不离开浏览器；不带 cookie；自动化浏览器不发；接口不通时不报错。
- `tests/visit-pages.test.ts`：每个页面都带着接口收得下的路径；绑定名和数据集名与代码一致；预览里没有绑定。
- `tests/privacy-page.test.ts`：隐私说明页上列的访问记录内容，就是 `VISIT_FIELDS` 里的那几项。

测试用的是假的数据集（`src/worker/fake-env.ts`），不会写真数据，也不会访问网络。
