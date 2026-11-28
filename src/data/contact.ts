// 预约沟通页（P-04）的文字、待填项和还没到的文案。
// 文字照抄 design/copy.md「子页面 · 预约沟通」，不要改写。
// 页面（src/pages/contact.astro）、提交脚本（src/contact/）和接口的字段表
// （src/worker/contact/schema.ts）都从这里读。

/** 设计稿 screens/page-contact.html 的 <title> */
export const CONTACT_TITLE = 'ClinkAI 预约沟通';

/** 大标题分两行，句号是标题后面的实心圆点 */
export const CONTACT_HEADING = ['LET’S', 'TALK'] as const;

export const CONTACT_INTRO =
  '告诉我们你的品牌和想去的市场，我们会带着初步想法来聊。';

/** 表单每一项的标签。键名是设计稿里控件的 name，也是接口的字段名 */
export const FIELD_LABELS = {
  brand: '品牌名',
  site: '官网或店铺链接',
  market: '想去的市场',
  service: '需要哪些服务',
  budget: '月预算',
  contact: '怎么联系你',
  note: '补充说明（选填）',
} as const;

export const MARKETS = [
  '北美',
  '欧洲',
  '中东',
  '东南亚',
  '日韩',
  '拉美',
  '其他',
] as const;

export const SERVICES = [
  '策略',
  '品牌',
  '广告',
  '达人',
  '内容',
  '结果分析',
] as const;

/** 「怎么联系你」输入框里的占位文字 */
export const CONTACT_PLACEHOLDER = '微信 / 邮箱 / 电话';

export const SUBMIT_LABEL = '提交，预约沟通 →';

/** 月预算下拉里排在各档后面的那一项 */
export const BUDGET_FALLBACK = '先聊聊再说';

/** 左下角联系方式两行的标签 */
export const DETAIL_LABELS = { email: '邮箱', wechat: '微信' } as const;

// ---------- 【待填】 ----------
// design/copy.md 末尾的清单：这三项要用户给真实信息。
// 没补齐（null）的那一块页面上整块隐藏，不留占位字样；补齐时只改这里。
export interface ContactTodo {
  /** 联系邮箱：公开显示在页面上的那个，和接口的收件地址（CONTACT_TO，放 secret）不是一回事 */
  readonly email: string | null;
  /** 微信号 */
  readonly wechat: string | null;
  /** 月预算的分档，按从低到高排。没补齐时月预算整块隐藏，接口也不收 budget */
  readonly budgetTiers: readonly string[] | null;
}

export const CONTACT_TODO: ContactTodo = {
  email: null,
  wechat: null,
  budgetTiers: null,
};

// ---------- 交接包里还没有的文案 ----------
// 提交后的提示语、按字段标错的提示语、隐私说明，design/copy.md 里都没有，
// 已在 Issue #15 里向设计侧要。**不要在这里自己写**：设计侧给了，照抄进来。
// 还是 null 的那一句页面上不显示；隐私说明是 null 时那一块不渲染。
export interface ContactCopy {
  /** 隐私说明 */
  readonly privacy: string | null;
  /** 提交成功 */
  readonly success: string | null;
  /** 校验失败时的整体提示（每个字段自己的提示在 fieldErrors） */
  readonly invalid: string | null;
  /** 限流：一分钟内提交太多次（接口回 429） */
  readonly rateLimited: string | null;
  /** 提交失败：发信失败、服务端出错、网络不通、超时 */
  readonly failed: string | null;
  /** 已经提交成功以后又点了一次 */
  readonly duplicate: string | null;
  /** 出错字段下面的提示，按错误码：必填没填、超长、格式不对 */
  readonly fieldErrors: {
    readonly required: string | null;
    readonly too_long: string | null;
    readonly invalid: string | null;
  };
}

export const CONTACT_COPY: ContactCopy = {
  privacy: null,
  success: null,
  invalid: null,
  rateLimited: null,
  failed: null,
  duplicate: null,
  fieldErrors: { required: null, too_long: null, invalid: null },
};

/** 月预算下拉的全部选项：各档加「先聊聊再说」。分档没补齐时是 null */
export function budgetOptions(
  tiers: readonly string[] | null,
): readonly string[] | null {
  return tiers && tiers.length > 0 ? [...tiers, BUDGET_FALLBACK] : null;
}
