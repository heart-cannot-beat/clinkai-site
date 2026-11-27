# Claude Code 工作流程

ClinkAI 官网：Astro 纯静态站 + TypeScript，托管在 Cloudflare Workers 静态资源上。一次只做一个 GitHub Issue。

在本仓库挑一个带 `ready-for-agent` 的未关闭 Issue。

1. 用 `gh issue view <编号> --comments` 读完整工单和评论。只有带 `ready-for-agent`、并且所有 `Blocked by` 的 Issue 都已关闭时才开工；开工时把它指派给自己。
2. 读 `design/` 交接包里和这个 Issue 有关的部分：对应屏的 HTML 源和参考截图、动效说明、设计规范、图片清单。**设计和文案以交接包为准**；代码和交接包对不上时，在 Issue 里报，不要自己改设计或文案。
3. 从最新的 `main` 建分支 `claude/issue-<编号>-<slug>`。diff 只在工单范围内，保留与本单无关的用户改动。
4. 交付完整的一块：页面或组件、样式、构建脚本、（涉及时）Worker 路由和它的测试、手机和「减少动态效果」下的降级行为，以及工单要求的证据（测试、截图、录屏）。
5. 本地跑 `npm run verify` 和工单另外要求的命令。开 PR：引用 Issue，贴 verify 的输出，写明新增依赖的理由和协议、截图或录屏证据、剩下的风险。PR 合并前 Issue 保持打开。
6. PR 合并后删掉这个任务的 worktree，免得在磁盘上越积越多：在主 checkout 里跑 `git worktree remove --force .claude/worktrees/<name>`（里面还有没提交或没推送的工作时不要删）。

## 规则

1. **设计和文案以 `design/` 交接包为准。** 不改文案，不改设计；发现设计稿有问题，在 Issue 里报。
2. **不写产品没做到的能力。** 不出现「飞轮」「越用越准」「品类经验库」；不编数字、客户、评价。关于学习效果，能写的只有「每一轮的结果都喂给下一轮」。
3. **不写真实客户或合作方的名字。** 示例品牌只用虚构的（Pebblesound、Halfmile、Acme Charge 等），每一处示例都标「示例」。
4. **广告屏只用广告图片，达人视频只出现在达人屏。**
5. **线上不调用任何 AI 接口。** 版本墙这类内容在构建时用代码生成。
6. **第三方库只能经 npm 打包进站点。** 不引在线字体地址，不引在线脚本地址。新增任何依赖都要在 PR 里写明理由和协议；下面「不用的库」里列的不加。
7. **密钥不进仓库。** Turnstile 密钥、收件邮箱放 Cloudflare 的 secret 和变量；本地用 `.dev.vars`（已被 git 忽略）。
8. **这些事先问再做：** 切域名（把 `clinkai.app` 指到 Worker）、往真实邮箱发信、改 Cloudflare 账号设置、把仓库改成公开。在用户点头前，部署只挂在 workers.dev 子域名上。
9. **开 PR 前本地跑 `npm run verify`，结果贴进 PR。**

## 技术约定

- **页面：** Astro 纯静态输出，TypeScript strict。不引 React 或其他前端框架。
- **滚动动效：** 每屏一个场景模块。「固定在屏幕上」用 CSS `position: sticky`；GSAP + ScrollTrigger 只用来把这一屏的时间线绑到滚动进度，不用它的 pin。手机和系统开了「减少动态效果」（`prefers-reduced-motion: reduce`）时不加载 GSAP，显示静态帧。GSAP 用它自家的免费许可（不是 MIT）：官网这种用途允许，不能转卖，也不能拿它做动效工具类的竞品。
- **立体效果：** 叠板用 CSS 3D 变换，不用 WebGL 库。
- **字体：** 自托管；中文用系统字体兜底。
- **托管：** Cloudflare Workers 静态资源（不用 Pages）。
- **表单：** Worker 路由 `POST /api/contact` 收表单，用 Cloudflare Email Service 绑定发到收件邮箱；不存库，不在日志里记录正文。
- **不用的库：** Magic UI、React Bits、Aceternity UI、Animate UI、Cult UI、Motion Primitives（React 组件库，而且一眼能认出是模板）；Three.js、React Three Fiber；Lenis 平滑滚动（微信和手机上风险大）；Tailark、Launch UI。

## 命令

| 命令                   | 作用                                                          |
| :--------------------- | :------------------------------------------------------------ |
| `npm run dev`          | 本地开发服务器，`localhost:4321`                              |
| `npm run build`        | 构建到 `dist/`                                                |
| `npm run preview`      | 本地预览构建结果                                              |
| `npm run format`       | Prettier 自动格式化                                           |
| `npm run format:check` | 检查格式                                                      |
| `npm run lint`         | ESLint（含 `.astro` 文件）                                    |
| `npm run typecheck`    | `astro check`，TypeScript strict                              |
| `npm run test`         | Vitest；测试里可以用 Astro Container API 渲染 `.astro` 组件   |
| `npm run verify`       | 依次跑格式检查、lint、类型检查、测试、构建。CI 跑的就是这一条 |

开发服务器需要放后台时用 `npx astro dev --background`，再用 `npx astro dev stop`、`status`、`logs` 管理。

## 目录

- `src/pages/`：页面路由。
- `design/`：设计侧导出的交接包（每屏 HTML 源和参考截图、动效说明、动效小样源码、版本墙生成脚本和变体配置、图片清单、设计规范）。只读；不在格式、lint、类型检查范围内。
- `tests/`：跨模块测试。单个模块的测试放在它旁边，命名 `*.test.ts`。
