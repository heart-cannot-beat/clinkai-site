# 表单接口 `POST /api/contact`

给预约沟通页（P-04）的表单用。代码在 `src/worker/`，绑定在 `wrangler.jsonc`。

> **字段待按交接包对齐。** `design/` 交接包还没到，`src/worker/contact/schema.ts` 里的 `CONTACT_FIELDS` 是占位字段（`name`、`email`、`company`、`message`），不是最终字段。交接包到了以后只改 `CONTACT_FIELDS`，校验、发信正文和测试都从这一处读字段。

## 请求

- 方法和路径：`POST /api/contact`
- 请求体：`application/json`，或者 `application/x-www-form-urlencoded` / `multipart/form-data`。
- 请求体上限：16 KB。
- Turnstile token 放在 `cf-turnstile-response` 字段里。Turnstile 组件放在 `<form>` 里时会自动加这个隐藏字段；用 JSON 提交时用同一个键名。必填，不超过 2048 个字符。
- 字段表里没有的键直接丢掉，不进邮件。

占位字段（以 `schema.ts` 为准）：

| 字段      | 类型 | 必填 | 长度上限 | 说明                                                      |
| :-------- | :--- | :--- | :------- | :-------------------------------------------------------- |
| `name`    | 单行 | 是   | 100      |                                                           |
| `email`   | 邮箱 | 是   | 254      | 规则同浏览器的 `<input type=email>`；也用作邮件的回复地址 |
| `company` | 单行 | 否   | 100      |                                                           |
| `message` | 多行 | 是   | 2000     |                                                           |

所有值都会先去掉首尾空白。长度按字符算，不按字节算。单行字段里不能有换行。

```json
{
  "name": "林（示例）",
  "email": "lin@pebblesound.example",
  "company": "Pebblesound（示例）",
  "message": "示例留言",
  "cf-turnstile-response": "<Turnstile 组件给的 token>"
}
```

## 响应

响应体都是 JSON，带 `Cache-Control: no-store`。前端界面上的提示文案以交接包为准，这里只约定状态码和错误码。

| 情况                   | 状态码 | 响应体                                                                  | 前端怎么处理                      |
| :--------------------- | :----- | :---------------------------------------------------------------------- | :-------------------------------- |
| 成功                   | 200    | `{"ok":true}`                                                           | 显示提交成功                      |
| 校验失败               | 422    | `{"ok":false,"error":"validation_failed","fields":{"email":"invalid"}}` | 按字段标错，见下面的字段错误码    |
| 防刷失败               | 403    | `{"ok":false,"error":"turnstile_failed"}`                               | 重置 Turnstile 组件，让用户再提交 |
| 限流                   | 429    | `{"ok":false,"error":"rate_limited"}`，带 `Retry-After: 60`             | 提示稍后再试                      |
| 发送失败               | 502    | `{"ok":false,"error":"send_failed"}`                                    | 提示稍后再试                      |
| Turnstile 服务不可用   | 503    | `{"ok":false,"error":"turnstile_unavailable"}`                          | 提示稍后再试                      |
| 请求体格式不对         | 400    | `{"ok":false,"error":"bad_request"}`                                    | 前端代码有问题，正常不会出现      |
| 请求体太大             | 413    | `{"ok":false,"error":"payload_too_large"}`                              | 同上                              |
| 不是 POST              | 405    | `{"ok":false,"error":"method_not_allowed"}`，带 `Allow: POST`           | 同上                              |
| 服务端配置缺失或密钥错 | 500    | `{"ok":false,"error":"server_error"}`                                   | 提示稍后再试；需要我们查配置      |

字段错误码：`required`（必填没填或只有空白）、`too_long`（超长）、`invalid`（格式不对、单行字段有换行，或者值不是字符串）。

处理顺序：方法 → 配置 → 限流 → 读请求体 → 字段校验 → Turnstile → 发信。字段校验在 Turnstile 前面，这样字段填错时不会白白用掉一个 token（token 只能用一次）。

## 防刷：Turnstile

服务端调 [siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) 校验 token，带上 `CF-Connecting-IP` 作为 `remoteip`，5 秒超时。

| siteverify 的结果                                                                            | 接口返回                    |
| :------------------------------------------------------------------------------------------- | :-------------------------- |
| `success: true`                                                                              | 继续发信                    |
| `invalid-input-response`、`timeout-or-duplicate`、`missing-input-response`、`bad-request` 等 | 403 `turnstile_failed`      |
| `internal-error`、连不上、超时、非 2xx                                                       | 503 `turnstile_unavailable` |
| `missing-input-secret`、`invalid-input-secret`（我们的密钥问题）                             | 500 `server_error`          |

本地开发用官方[测试密钥](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)：密钥 `1x0000000000000000000000000000000AA` 永远通过，配合测试 sitekey `1x00000000000000000000AA`（它生成的 token 是 `XXXX.DUMMY.TOKEN.XXXX`）。想在本地看防刷失败，把 `.dev.vars` 里的密钥换成 `2x0000000000000000000000000000000AA`（永远失败，返回 403）或 `3x0000000000000000000000000000000AA`（token 已用过，返回 403）。

## 限流

用 Workers 自带的 [Rate Limiting 绑定](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)（`wrangler.jsonc` 里的 `CONTACT_RATE_LIMITER`）：

- **键：** `contact:<CF-Connecting-IP>`。没有这个头时（只会在本地出现）键是 `contact:unknown`。
- **阈值：** 同一个键 60 秒内 5 次，超过返回 429 和 `Retry-After: 60`。
- **在哪一步：** 读请求体之前。被限流的请求不读请求体、不调 Turnstile、不发信。校验失败的提交也计数。
- **为什么用 IP：** 官方文档不建议拿 IP 做键，因为很多人可能共用一个出口 IP（公司网络、运营商 NAT）。这个表单没有登录，拿不到用户 ID，只能用 IP。阈值放得宽（正常人一分钟提交不了 5 次），防刷主要靠 Turnstile，限流只挡住短时间内的连续请求。
- **精度：** 官方文档写明这是近似计数，而且按 Cloudflare 节点分别计数，不是全球统一的严格上限。要严格的全局上限得换 Durable Objects，现在用不着。
- **绑定出错时放行：** `limit()` 抛错时继续处理（日志记 `rate_limit_error`），由 Turnstile 兜底，避免把真实用户全挡掉。
- **`namespace_id`：** 用的是 `3001`。它在整个 Cloudflare 账号里要唯一，同一个值的绑定会共用计数。账号里别的 Worker 用了 `3001` 的话要换一个。

## 发信：Cloudflare Email Service

用 [`send_email` 绑定](https://developers.cloudflare.com/email-service/configuration/send-bindings/)（`wrangler.jsonc` 里的 `EMAIL`）调结构化的 [`send()`](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)：

- 收件人是 `CONTACT_TO`，发件人是 `CONTACT_FROM`，标题固定，正文是纯文本（不发 HTML），回复地址是用户填的邮箱。
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
| `TURNSTILE_SECRET_KEY` | secret | Cloudflare secret；本地 `.dev.vars` | Turnstile 组件的密钥                          |
| `CONTACT_TO`           | secret | Cloudflare secret；本地 `.dev.vars` | 收件地址，必须是已验证收件地址                |
| `CONTACT_FROM`         | secret | Cloudflare secret；本地 `.dev.vars` | 发件地址，在已接入 Email Service 发信的域名下 |
| `ASSETS`               | 绑定   | `wrangler.jsonc`                    | 静态资源                                      |
| `EMAIL`                | 绑定   | `wrangler.jsonc`                    | 发信                                          |
| `CONTACT_RATE_LIMITER` | 绑定   | `wrangler.jsonc`                    | 限流                                          |

收发件地址也放 secret，不放 `wrangler.jsonc` 的 `vars`：一是地址不进仓库；二是在后台手动加的普通变量，下次 `wrangler deploy` 会被覆盖（[官方说明](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth)），secret 不会。三个值缺任何一个，接口都返回 500 `server_error`，日志记 `missing_config:<名字>`。

## 需要在 Cloudflare 里做的事

这些是账号设置，由有权限的人来做；agent 不做。

1. **接入发信域名。** 在 Email Service 里接入发件域名（按提示加 DNS 记录），定一个发件地址作为 `CONTACT_FROM`。发件域名如果是 `clinkai.app`，先确认（切域名要先问）。
2. **验证收件地址。** 把收件邮箱加成已验证收件地址（Email Routing → Destination addresses，收件箱里点验证链接），作为 `CONTACT_TO`。
3. **建 Turnstile 组件。** 主机名先填 workers.dev 子域名，切域名以后再加 `clinkai.app`。sitekey 给前端（P-04）用，密钥作为 `TURNSTILE_SECRET_KEY`。
4. **设置 secret：**

   ```sh
   npx wrangler secret put TURNSTILE_SECRET_KEY
   npx wrangler secret put CONTACT_TO
   npx wrangler secret put CONTACT_FROM
   ```

5. **确认限流的 `namespace_id`**（`3001`）在账号里没被别的 Worker 用。

## 日志

- 只输出一行 JSON：`{"route":"/api/contact","outcome":"<结果>","detail":"<错误码>"}`。
- `detail` 只放结果码、字段名和第三方返回的错误码，过一遍白名单正则；不符合的一律写成 `redacted`。
- 不记表单内容、邮箱等联系方式、Turnstile token、IP，也不记第三方的错误信息（里面可能带收件人）。`handler.test.ts` 里有专门的测试检查这一点。
- 不存库：没有 KV、D1、R2，表单内容只存在于这一次请求和发出去的那封邮件里。

## 本地开发

```sh
npm run build                       # Worker 的静态资源目录是 dist/
cp .dev.vars.example .dev.vars      # Turnstile 测试密钥 + 虚构的收发件地址
npx wrangler dev
```

然后用测试 token 提交一次：

```sh
curl -i http://localhost:8787/api/contact \
  -H 'content-type: application/json' \
  -d '{"name":"林（示例）","email":"lin@pebblesound.example","message":"示例留言","cf-turnstile-response":"XXXX.DUMMY.TOKEN.XXXX"}'
```

`wrangler dev` 会把这封模拟的邮件打到终端，不会真发。

## 测试

`npm run test` 跑 `src/worker/**/*.test.ts`：发信、限流、静态资源都是假的绑定（`src/worker/fake-env.ts`），siteverify 用 `vi.stubGlobal('fetch', …)` 替掉，测试不会发信，也不会访问网络。
