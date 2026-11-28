// 隐私说明页（src/pages/privacy.astro）的文字。
//
// ⚠️ 草稿：交接包里没有隐私说明的文案，也没有设计稿。
// P-06 按用户的要求先写了草稿，等用户看过再定（Issue #17）。定稿后只改这里。
//
// 写的时候只写代码里查得到的事实，每一句对应的出处：
// - 表单收哪几项：接口的字段表（src/worker/contact/schema.ts），页面上的这一串是从字段表生成的；
// - 发到收件邮箱、不存库、日志不记内容和 IP：src/worker/contact/handler.ts 和它的测试；
// - 按 IP 限流：wrangler.jsonc 的 CONTACT_RATE_LIMITER，说明在 docs/contact-api.md；
// - 没有 cookie、没有第三方脚本、没有访问统计：tests/privacy-page.test.ts 和 tests/no-online-assets.test.ts 盯着。
// 站点的做法变了（比如加了访问统计），先改这里，测试会提醒。

/** 页面标题，照子页面的写法：「ClinkAI」加页面名 */
export const PRIVACY_TITLE = 'ClinkAI 隐私说明';

/** 这一页的描述，显示在搜索结果和分享卡片上 */
export const PRIVACY_DESCRIPTION =
  '这个网站收集哪些信息、用来做什么、不做什么。';

/** 英文大标题，一项一行 */
export const PRIVACY_HEADING = ['PRIVACY.'] as const;

/** 标题下面的那段话 */
export const PRIVACY_LEAD =
  '这个网站只在你提交预约沟通表单时收集你填写的内容。下面写明收什么、用来做什么、不做什么。';

export const PRIVACY_UPDATED_LABEL = '最后更新';

/** 这份说明最后一次改动的日期。改了上面或下面的任何一句，把它也改了 */
export const PRIVACY_UPDATED = '2026-11-28';

export interface PrivacySection {
  /** 小节的锚点 */
  readonly id: string;
  readonly title: string;
  /** 这一节的内容，按顺序：字符串是一段话，数组是一个列表 */
  readonly blocks: readonly (string | readonly string[])[];
  /** 这一节末尾带一个去预约沟通页的链接 */
  readonly contactLink?: boolean;
}

export interface PrivacyFacts {
  /** 表单现在收的每一项在页面上的标签，按表单的顺序 */
  readonly fieldLabels: readonly string[];
  /** 公开的联系邮箱（【待填】，src/data/contact.ts）。没补齐时不提邮箱 */
  readonly email: string | null;
}

export function privacySections({
  fieldLabels,
  email,
}: PrivacyFacts): readonly PrivacySection[] {
  return [
    {
      id: 'form',
      title: '你提交的表单',
      blocks: [
        '在预约沟通页提交表单时，我们会收到你填写的这几项：',
        fieldLabels,
        '这些内容会作为一封邮件发到我们自己的收件邮箱，用来回复你、准备这次沟通。',
        '网站不把表单内容存进数据库，我们的日志里也不记录表单内容和你的联系方式。',
      ],
    },
    {
      id: 'rate-limit',
      title: '防止重复提交',
      blocks: [
        '为了挡住短时间内的连续提交，表单接口会按 IP 地址限制提交次数。IP 地址只用来计数，不写进日志，也不会和表单内容一起发给我们。',
      ],
    },
    {
      id: 'hosting',
      title: '访问网站本身',
      blocks: [
        '网站托管在 Cloudflare。和访问任何网站一样，浏览器连到服务器时，托管方会处理 IP 地址、浏览器类型这类传输页面必需的技术信息。',
        '这个网站目前没有访问统计。',
      ],
    },
    {
      id: 'never',
      title: '我们不做的事',
      blocks: [
        [
          '不使用 cookie。',
          '不加载第三方的统计、广告或社交媒体脚本。',
          '不做跨网站追踪，不做设备指纹。',
        ],
      ],
    },
    {
      id: 'requests',
      title: '查看、更正或删除',
      blocks: [
        email
          ? `想查看、更正或删除你提交过的内容，可以在预约沟通页留言，或者发邮件到 ${email}。`
          : '想查看、更正或删除你提交过的内容，可以在预约沟通页留言告诉我们。',
      ],
      contactLink: true,
    },
  ];
}
