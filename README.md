# clinkai-site

ClinkAI 官网。Astro 纯静态站 + TypeScript，托管在 Cloudflare Workers 静态资源上。

需要 Node 22（见 `.nvmrc`，不低于 22.23.4）。

```sh
npm install
npm run dev      # localhost:4321
npm run verify   # 格式、lint、类型、测试、构建，一条命令跑全
```

部署方式和第一次设置的步骤见 [docs/deploy.md](docs/deploy.md)。

表单接口 `POST /api/contact`（Cloudflare Worker）的请求、响应、配置和套餐说明见 [docs/contact-api.md](docs/contact-api.md)。

首页现在是桌面静态版：6 屏，每屏对应 `design/screens/` 里的一帧，各屏的组件在 `src/home/`，整页按宽度等比缩放。滚动动效和手机版还没做。

首页的版本墙（示例广告小图）在构建时生成，做法和设计侧更新后的同步步骤见 [docs/version-wall.md](docs/version-wall.md)。

工作流程和规则见 [CLAUDE.md](CLAUDE.md)。设计和文案以 `design/` 交接包为准。
