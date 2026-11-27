# 部署

站点托管在 Cloudflare Workers 静态资源上，配置在仓库根目录的 `wrangler.jsonc`。部署由 Cloudflare 的 Git 集成 **Workers Builds** 完成：

| 什么时候                      | Cloudflare 做什么                            | 地址                                                     |
| :---------------------------- | :------------------------------------------- | :------------------------------------------------------- |
| 合并（push）到 `main`         | `npm run build`，然后 `npx wrangler deploy`  | `https://clinkai-site.<账号子域名>.workers.dev`          |
| 其他分支的 push（含 PR 分支） | `npm run build`，然后 `npx wrangler preview` | `https://<预览名>-clinkai-site.<账号子域名>.workers.dev` |

预览名默认取自分支名。PR 上会有 Cloudflare 自动发的评论，写着构建状态和这个 PR 的预览地址；之后每次 push，同一个预览地址会更新。

`wrangler preview` 要求 `wrangler.jsonc` 里有 `previews` 块（可以为空），删掉它 PR 预览就会构建失败。预览不继承生产的绑定和密钥，预览要用的绑定写在这个块里。

**现在只挂在 workers.dev 子域名上。** 把 `clinkai.app` 指到这个 Worker 是单独的 L-01，用户点头之前不在 `wrangler.jsonc` 里加 `routes`，也不在后台绑自定义域名。`tests/wrangler-config.test.ts` 会拦住不小心加上的路由。

账号 ID、API Token 都不进仓库，也不需要放进 GitHub secrets：Workers Builds 用的 Token 存在 Cloudflare 那边。

## 第一次设置（在 Cloudflare 和 GitHub 后台手动做）

下面这些是账号设置，由账号的主人来做，agent 不代做。按钮名以 Cloudflare 后台当时的界面为准。

### 1. 确认 workers.dev 子域名

1. 登录 Cloudflare 后台，进 **Workers & Pages**。
2. 看页面上的 **Your subdomain**（形如 `<名字>.workers.dev`）。还没有的话，按提示起一个。这个名字会出现在所有预览地址和正式的 workers.dev 地址里，对外可见，起之前想一下。

### 2. 用仓库创建 Worker 并连上 Git

1. **Workers & Pages** → **Create application** → 选 **GitHub**。
2. 第一次会跳到 GitHub 安装 **Cloudflare Workers and Pages** 这个 GitHub App。装到 `heart-cannot-beat` 组织上时，选 **Only select repositories**，只勾 `clinkai-site`。（装 App 需要组织管理员权限。）
3. 回到 Cloudflare，在列表里选 `heart-cannot-beat/clinkai-site`。
4. 配置项这样填：

   | 配置项                                  | 填什么                                                                   |
   | :-------------------------------------- | :----------------------------------------------------------------------- |
   | 项目名 / Worker 名                      | `clinkai-site`（必须和 `wrangler.jsonc` 里的 `name` 一样，否则构建失败） |
   | Production branch                       | `main`                                                                   |
   | Build command                           | `npm run build`                                                          |
   | Deploy command                          | `npx wrangler deploy`（默认值）                                          |
   | Preview command（非生产分支的部署命令） | `npx wrangler preview`（默认值）                                         |
   | Root directory                          | `/`（默认值）                                                            |
   | API token                               | 让 Cloudflare 新建一个。它只存在 Cloudflare 里，不要复制到任何地方       |
   | 构建变量 / 环境变量                     | 都不用加。Node 版本由仓库的 `.nvmrc`（22）决定                           |

5. 点 **Save and Deploy**。第一次构建跑完后，打开 `https://clinkai-site.<账号子域名>.workers.dev`，应该是一个空白页，浏览器标签上的标题是 `ClinkAI`。

### 3. 打开 PR 预览

1. 进这个 Worker → **Settings** → **Build** → **Branch control**。
2. 确认 Production branch 是 `main`，勾上 **Enable Preview Builds**（新建的 Worker 默认已经勾上，并且用的是 Worker Previews）。
3. 如果这里有「是否构建来自 fork 的 PR」之类的选项，选不构建。这是公开仓库，不应该让陌生人的改动在我们的 Cloudflare 账号里跑构建。

### 4.（建议）在 GitHub 上保护 `main`

Workers Builds 只要 `main` 有 push 就部署，不看 GitHub Actions 的结果。要让只有通过 `npm run verify` 的代码才进 `main`：

1. GitHub 仓库 → **Settings** → **Rules**（或 **Branches**）→ 给 `main` 加规则。
2. 勾上「合并前必须走 PR」和「合并前必须通过状态检查」，检查项选 CI 里的 `verify`。

### 5. 验证

1. 在任意一个开着的 PR 分支上 push 一次（空提交也行），PR 下面会出现 Cloudflare 的评论，里面有预览地址；打开应该是空白首页。
2. 合并到 `main` 后，Cloudflare 后台这个 Worker 的 **Deployments** 里会出现新的部署，`https://clinkai-site.<账号子域名>.workers.dev` 更新。

## 本地

```sh
npm run build
npx wrangler dev               # 用本地的 Workers 运行时托管 dist/，http://localhost:8787
npx wrangler deploy --dry-run  # 只检查打包，不上传、不需要登录
```

本地不需要 `wrangler login`，也不从本地往线上部署；线上部署只走 Workers Builds。

## 出问题时

- **构建失败**：线上保持上一次成功的版本不变。在 Cloudflare 后台这个 Worker 的 **Deployments** / 构建日志里看原因。
- **线上版本有问题要回退**：后台 **Deployments** 里选上一个版本回滚。
- **预览地址是公开的**：知道地址的人都能打开。官网本身就是公开内容，现在不加限制；以后如果预览里要放还没公开的内容，可以给预览地址加 Cloudflare Access（这也是账号设置，要先问）。
