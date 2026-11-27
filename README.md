# clinkai-site

ClinkAI 官网。Astro 纯静态站 + TypeScript，托管在 Cloudflare Workers 静态资源上。

需要 Node 22（见 `.nvmrc`，不低于 22.23.4）。

```sh
npm install
npm run dev      # localhost:4321
npm run verify   # 格式、lint、类型、测试、构建，一条命令跑全
```

部署方式和第一次设置的步骤见 [docs/deploy.md](docs/deploy.md)。

工作流程和规则见 [CLAUDE.md](CLAUDE.md)。设计和文案以 `design/` 交接包为准。
