# 表单接口 `POST /api/contact`

给预约沟通页（P-04，`/contact/`）的表单用。接口代码在 `src/worker/`，绑定在 `wrangler.jsonc`；页面怎么接它见文末「页面怎么接」。

> **不做防刷校验。** 用户 2026-11-28 决定先不用 Turnstile（现在没有流量），见 Issue #15。接口不需要 token，也不需要任何 Turnstile 配置；限流保留。以后收到垃圾留言要加回来时，S-03 的实现在 PR #7 的历史里（`src/worker/contact/turnstile.ts` 和 `handler.ts` 里校验 token 的那一段）。注意 Turnstile 组件要从 Cloudflare 的在线地址加载脚本，和 CLAUDE.md 规则 6 冲突，加回来之前要先定怎么处理。

> **必填和长度上限是暂定的。** 交接包里没有这些规则，已在 Issue #15 里问设计侧。现在按「设计稿里只有补充说明标了选填，其余都必填」做。答复到了只改 `src/worker/contact/schema.ts` 里的 `buildContactFields`，校验、页面上的 `required` / `maxlength`、发信正文和测试都从这一处读。

## 请求

- 方法和路径：`POST /api/contact`
- 请求体：`application/json`，或者 `application/x-www-form-urlencoded` / `multipart/form-data`。页面的提交脚本发 JSON；脚本没加载时浏览器按普通表单提交，发的是表单编码。
- 请求体上限：16 KB。边读边数字节，超过就停下返回 413；没有 `Content-Length` 的分块上传也一样，不会先把整个请求体读进内存。
- 字段表里没有的键直接丢掉，不进邮件。

字段（以 `schema.ts` 为准；字段名、顺序和多选项照 `design/screens/page-contact.html` 的表单）：

| 字段      | 页面上的标签     | 类型 | 必填（暂定）   | 上限（暂定） | 说明                                                |
| :-------- | :--------------- | :--- | :------------- | :----------- | :-------------------------------------------------- |
| `brand`   | 品牌名           | 单行 | 是             | 100 字       |                                                     |
| `site`    | 官网或店铺链接   | 单行 | 是             | 300 字       | 接口只当普通文字收，不校验是不是网址                |
| `market`  | 想去的市场       | 多选 | 是，至少选一个 |              | 北美、欧洲、中东、东南亚、日韩、拉美、其他          |
| `service` | 需要哪些服务     | 多选 | 是，至少选一个 |              | 策略、品牌、广告、达人、内容、结果分析              |
| `budget`  | 月预算           | 单选 |                |              | **现在不收。** 分档是【待填】，补齐后才出现，见下面 |
| `contact` | 怎么联系你       | 单行 | 是             | 200 字       | 微信、邮箱或电话，自由填写，不校验格式              |
| `note`    | 补充说明（选填） | 多行 | 否             | 2000 字      |                                                     |

- 单行和多行字段：值先去掉首尾空白。长度按字符算，不按字节算。单行字段里不能有换行。
- 多选字段：JSON 里是字符串数组；表单编码里是重复的同名键（只选一个时是单个值，也收）。只收上表列出的选项，去重后按选项表的顺序进邮件，用顿号连成一行。
- 月预算：分档在 `src/data/contact.ts` 的 `CONTACT_TODO.budgetTiers`，是 `design/copy.md` 里的【待填】。没补齐时页面上月预算整块隐藏，接口也不收 `budget`（发来了会被当成多余的键丢掉）。补齐后它是单选，选项是各档加「先聊聊再说」。
- 表单里没有邮箱字段，所以发出去的邮件不带回复地址。

```json
{
  "brand": "Pebblesound（示例）",
  "site": "https://pebblesound.example",
  "market": ["北美", "日韩"],
  "service": ["广告", "达人"],
  "contact": "微信 pebblesound-example",
  "note": "示例留言"
}
```

## 响应

响应体都是 JSON，带 `Cache-Control: no-store`。前端界面上的提示文案以交接包为准，这里只约定状态码和错误码。

| 情况           | 状态码 | 响应体                                                                   | 页面怎么处理                       |
| :------------- | :----- | :----------------------------------------------------------------------- | :--------------------------------- |
| 成功           | 200    | `{"ok":true}`                                                            | 显示提交成功，按钮保持禁用         |
| 校验失败       | 422    | `{"ok":false,"error":"validation_failed","fields":{"brand":"required"}}` | 按字段标错，见下面的字段错误码     |
| 限流           | 429    | `{"ok":false,"error":"rate_limited"}`，带 `Retry-After: 60`              | 提示稍后再试，按钮可以再点         |
| 发送失败       | 502    | `{"ok":false,"error":"send_failed"}`                                     | 提示提交失败，按钮可以再点         |
| 服务端配置缺失 | 500    | `{"ok":false,"error":"server_error"}`                                    | 同上；需要我们查配置               |
| 请求体格式不对 | 400    | `{"ok":false,"error":"bad_request"}`                                     | 同上；前端代码有问题，正常不会出现 |
| 请求体太大     | 413    | `{"ok":false,"error":"payload_too_large"}`                               | 同上                               |
| 不是 POST      | 405    | `{"ok":false,"error":"method_not_allowed"}`，带 `Allow: POST`            | 同上                               |

字段错误码：`required`（必填没填、只有空白，或者多选一个都没选）、`too_long`（超长）、`invalid`（单行字段有换行、值的类型不对、多选里有选项表之外的值，或者表单编码里单行字段出现了重复的键）。

处理顺序：方法 → 配置 → 限流 → 读请求体 → 字段校验 → 发信。

## 限流

用 Workers 自带的 [Rate Limiting 绑定](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)（`wrangler.jsonc` 里的 `CONTACT_RATE_LIMITER`）：

- **键：** `contact:<CF-Connecting-IP>`。没有这个头时（只会在本地出现）键是 `contact:unknown`。
- **阈值：** 同一个键 60 秒内 5 次，超过返回 429 和 `Retry-After: 60`。
- **在哪一步：** 读请求体之前。被限流的请求不读请求体、不发信。校验失败的提交也计数。
- **为什么用 IP：** 官方文档不建议拿 IP 做键，因为很多人可能共用一个出口 IP（公司网络、运营商 NAT）。这个表单没有登录，拿不到用户 ID，只能用 IP。阈值放得宽（正常人一分钟提交不了 5 次）。
- **它挡得住什么：** 短时间内的连续请求（连点、简单的脚本）。**挡不住**换着 IP 慢慢发的垃圾留言；现在没有别的防刷手段，收到垃圾留言时再把 Turnstile 加回来。
- **精度：** 官方文档写明这是近似计数，而且按 Cloudflare 节点分别计数，不是全球统一的严格上限。要严格的全局上限得换 Durable Objects，现在用不着。
- **绑定出错时放行：** `limit()` 抛错时继续处理（日志记 `rate_limit_error`），避免把真实用户全挡掉；这段时间等于没有限流。
- **`namespace_id`：** 用的是 `3001`。它在整个 Cloudflare 账号里要唯一，同一个值的绑定会共用计数。账号里别的 Worker 用了 `3001` 的话要换一个。

## 发信：Cloudflare Email Service

用 [`send_email` 绑定](https://developers.cloudflare.com/email-service/configuration/send-bindings/)（`wrangler.jsonc` 里的 `EMAIL`）调结构化的 [`send()`](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)：

- 收件人是 `CONTACT_TO`，发件人是 `CONTACT_FROM`，标题固定，正文是纯文本（不发 HTML），每个字段一段：字段名一行，值一行。
- 发件地址必须在已接入 Email Service 发信的域名下，否则会报 `E_SENDER_DOMAIN_NOT_AVAILABLE`。
- `send()` 抛错时返回 502 `send_failed`，日志只记错误码（比如 `E_RECIPIENT_PLAN_RESTRICTED`），不记错误信息。
- 本地 `wrangler dev` 默认只[模拟发信](https://developers.cloudflare.com/email-service/observability/local-development/sending/)：把邮件打到终端、存成本地文件，不会真发。**不要给绑定加 `"remote": true`**，加了本地也会真发。

### 发到自有邮箱要不要 Workers 付费套餐？

**不需要。** 只要收件地址是账号里的「已验证收件地址」（verified destination address），Workers Free 套餐就能发；发给其他任意收件人才需要 Workers Paid。我们的表单只发到自己的收件邮箱，满足这个条件。

官方原文（2026-11-27 核实）：

- [Pricing](https://developers.cloudflare.com/email-service/platform/pricing/)：Workers Free 套餐上 Email Sending 只能发给账号里的已验证收件地址，发给其他收件人需要 Workers Paid。
- [Limits → Verified destination addresses](https://developers.cloudflare.com/email-service/platform/limits/#verified-destination-addresses)：Free 套餐「Only verified destination addresses in your account」，Paid 套餐「Any recipient」。
- [Destination addresses](https://developers.cloudflare.com/email-service/configuration/destination-addresses/)：发给已验证收件地址在任何套餐下都免费，不占每月额度，也不占每日发送上限。
- [错误码](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/#error-codes)：Free 套餐发给未验证地址会报 `E_RECIPIENT_PLAN_RESTRICTED`。

注意：

- `CONTACT_TO` **必须**先加成已验证收件地址，否则 Free 套餐上每次发信都会失败（接口返回 502）。
- Email Sending 在官方文档里还标着 Beta，套餐和限制以后可能会变，上线前再看一眼上面几页。

## 配置

| 名字                   | 种类   | 放在哪                              | 说明                                          |
| :--------------------- | :----- | :---------------------------------- | :-------------------------------------------- |
| `CONTACT_TO`           | secret | Cloudflare secret；本地 `.dev.vars` | 收件地址，必须是已验证收件地址                |
| `CONTACT_FROM`         | secret | Cloudflare secret；本地 `.dev.vars` | 发件地址，在已接入 Email Service 发信的域名下 |
| `ASSETS`               | 绑定   | `wrangler.jsonc`                    | 静态资源                                      |
| `EMAIL`                | 绑定   | `wrangler.jsonc`                    | 发信                                          |
| `CONTACT_RATE_LIMITER` | 绑定   | `wrangler.jsonc`                    | 限流                                          |

收发件地址放 secret，不放 `wrangler.jsonc` 的 `vars`：一是地址不进仓库；二是在后台手动加的普通变量，下次 `wrangler deploy` 会被覆盖（[官方说明](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth)），secret 不会。两个值缺任何一个，接口都返回 500 `server_error`，日志记 `missing_config:<名字>`。`tests/wrangler-config.test.ts` 会拦住把它们写进配置的改动，也盯着 `.dev.vars.example` 只列这两项、只用虚构的 `*.example` 地址。

### PR 预览（Worker Previews）

[预览不继承生产配置](https://developers.cloudflare.com/workers/previews/configuration/)：绑定要写在 `wrangler.jsonc` 的 `previews` 块里，secret 要在后台的 Previews Base 里重新填。这个接口没有给预览配 `send_email`、`ratelimits` 和 secret，所以在预览里提交表单会直接返回 500 `server_error`（缺配置），走不到发信这一步；页面上按提交失败处理。这是有意的：预览不会往真实收件箱发信。`tests/wrangler-config.test.ts` 会拦住往 `previews` 里加发信绑定的改动；部署和预览的整体说明见 [docs/deploy.md](deploy.md)。

以后要在预览里测表单，就在 `previews` 块里加 `send_email` 和 `ratelimits`，把发信绑定用 `destination_address` 锁到一个专门测试用的已验证收件地址，再给预览单独填 secret。这一步要改 Cloudflare 设置，先问。

## 需要在 Cloudflare 里做的事

这些是账号设置，由有权限的人来做；agent 不做。做完之前，线上的表单提交会返回 500（缺配置）。

1. **接入发信域名。** 在 Email Service 里接入发件域名（按提示加 DNS 记录），定一个发件地址作为 `CONTACT_FROM`。发件域名如果是 `clinkai.app`，先确认（切域名要先问）。
2. **验证收件地址。** 把收件邮箱加成已验证收件地址（Email Routing → Destination addresses，收件箱里点验证链接），作为 `CONTACT_TO`。
3. **设置 secret：**

   ```sh
   npx wrangler secret put CONTACT_TO
   npx wrangler secret put CONTACT_FROM
   ```

4. **确认限流的 `namespace_id`**（`3001`）在账号里没被别的 Worker 用。

S-03 时如果已经设过 `TURNSTILE_SECRET_KEY`、`TURNSTILE_HOSTNAMES` 这两个 secret，现在用不上了，可以用 `npx wrangler secret delete <名字>` 删掉；留着也不影响。

## 日志

- 只输出一行 JSON：`{"route":"/api/contact","outcome":"<结果>","detail":"<错误码>"}`。
- `detail` 只放结果码、字段名和第三方返回的错误码，过一遍白名单正则；不符合的一律写成 `redacted`。
- 不记表单内容、联系方式、IP，也不记第三方的错误信息（里面可能带收件人）。`handler.test.ts` 里有专门的测试检查这一点。
- 不存库：没有 KV、D1、R2，表单内容只存在于这一次请求和发出去的那封邮件里。

## 本地开发

```sh
npm run build                       # Worker 的静态资源目录是 dist/
cp .dev.vars.example .dev.vars      # 虚构的收发件地址
npx wrangler dev
```

然后打开 `http://localhost:8787/contact/` 在页面上提交，或者直接调接口：

```sh
curl -i http://localhost:8787/api/contact \
  -H 'content-type: application/json' \
  -d '{"brand":"Pebblesound（示例）","site":"https://pebblesound.example","market":["北美"],"service":["广告"],"contact":"微信 pebblesound-example"}'
```

`wrangler dev` 只模拟发信，不会真发。连着提交超过 5 次会看到 429，等一分钟就好。

`npm run dev`（Astro 的开发服务器）只有页面，没有 `/api/contact`：在那里提交，页面会按提交失败处理。

## 测试

`npm run test` 跑 `src/worker/**/*.test.ts`：发信、限流、静态资源都是假的绑定（`src/worker/fake-env.ts`）。测试不会发信，也不会访问网络：`handler.test.ts` 把全局的 `fetch` 换成一调用就报错的假函数，接口要是又去访问外部服务，测试会失败。

## 页面怎么接

页面在 `src/pages/contact.astro`，表单在 `src/components/contact/ContactForm.astro`，提交脚本在 `src/contact/`。

- **字段是同一份。** 表单组件从 `buildContactFields` 读字段表：单行和多行控件的 `required`、`maxlength` 由它生成，同一份字段表写进表单的 `data-fields`，提交脚本读它。发请求之前，脚本先用接口的同一个 `validateFields` 校验一遍，不过就直接按字段标错，不发请求、不占限流的次数。浏览器自带的校验（必填、网址格式）没有关，文字框没填时先出现的是浏览器自己的提示。
- **状态。** 表单的 `data-state` 是 `idle`、`submitting`、`success`、`invalid`、`rate_limited`、`failed` 之一。提交中按钮禁用、表单带 `aria-busy`；请求 20 秒没回就取消，按失败处理。
- **重复提交。** 上一次请求还没回来时再提交，不会发第二个请求。提交成功后按钮一直禁用到刷新页面，再提交也不会发请求（暂定，Issue #15 第 11 问）。
- **按字段标错。** 出错的字段外层加 `data-invalid`，控件加 `aria-invalid="true"`，焦点移到第一个出错的控件；改了那个字段，标记就去掉。
- **提示语。** 提交结果写进 `[data-contact-status]`（`role="status"`，读屏会播报），字段的错误提示写进各自的 `[data-error-for]`。**提示语和隐私说明的文案交接包里还没有**（Issue #15），都在 `src/data/contact.ts` 的 `CONTACT_COPY` 里留着 `null`：是 `null` 的那一句不显示，隐私说明那一块不渲染。文案到了照抄进去就行，页面和脚本不用改。
- **脚本没加载时。** 表单的 `action` 就是接口地址，浏览器按普通表单提交，留言不会丢，只是提交后看到的是接口返回的 JSON。
- **【待填】。** 联系邮箱、微信号、月预算的分档在 `src/data/contact.ts` 的 `CONTACT_TODO` 里，没补齐的整块不渲染。页面上公开显示的联系邮箱和接口的收件地址 `CONTACT_TO` 不是一回事：前者补齐后写在代码里，后者永远只放 secret。
