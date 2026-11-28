// 上线基础（P-06）：站点级的配置。
// 分享卡片、canonical、站点地图和 robots.txt 里的绝对地址都从这里拼，别处不写域名。
// 说明见 docs/launch-basics.md。

/**
 * 站点的正式地址，不带末尾的斜杠。
 * 正式域名还没切（L-01）：先写 CLAUDE.md 里定的 clinkai.app，域名改了只改这一行。
 * 不要写 workers.dev 地址：账号子域名是个人信息（CLAUDE.md「公开仓库」），构建时会检查。
 */
export const SITE_URL = 'https://clinkai.app';

export const SITE_NAME = 'ClinkAI';

/** Open Graph 的语言标记，和 <html lang="zh-CN"> 对应 */
export const SITE_LOCALE = 'zh_CN';

/**
 * 没有自己描述的页面用这一句，首页也用它。
 * 照抄 design/copy.md「01 首屏」的中文说明（稿子里分两行，这里连成一句）；
 * tests/page-meta.test.ts 会和 copy.md 比对。
 */
export const DEFAULT_DESCRIPTION =
  '从策略、品牌、广告、达人、内容到结论，出海营销的每一层，一个团队做完。';

/**
 * 分享图：纸色底上一个标志，全站共用一张。图上没有示例素材，所以不用标「示例」。
 * 文件在 public/ 下，地址不带哈希（分享平台会缓存这个地址）。
 * 交接包里没有分享图，这一张是 P-06 用 scripts/share-image.mjs 按设计规范生成的草稿。
 */
export const SHARE_IMAGE = {
  path: '/share/clinkai.png',
  width: 1200,
  height: 630,
  alt: SITE_NAME,
} as const;

/** 站内路径 → 带域名的完整地址 */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).href;
}
