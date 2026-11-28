// 关于我们页（P-03）的文字和底部的四项事实。照抄 design/copy.md「子页面 · 关于我们」，不要改写。

/** 设计稿 screens/page-about.html 的 <title> */
export const ABOUT_TITLE = 'ClinkAI 关于我们';

/** 大标题下面的介绍；也是这一页的描述 */
export const ABOUT_INTRO =
  '一支帮中国品牌出海的增长团队。从策略、品牌、广告、达人、内容，一直做到出结论，都是同一个团队；也自己做工具，让每一轮投放都有据可查。';

// ---------- 【待填】 ----------
// 四项都在 design/copy.md 末尾的清单里，要用户给真实信息：成立年份、团队人数、
// 办公城市、投放平台（以实际在投的为准）。**不要自己编。**
// 没补齐（还有 null）之前，页面上这一块整块隐藏，不留占位字样；四项都补齐了才显示。
// 补齐时只改这里的 ABOUT_FACTS。

export const ABOUT_FACT_LABELS = {
  founded: '成立',
  team: '团队',
  office: '办公地',
  platforms: '投放平台',
} as const;

export type AboutFactKey = keyof typeof ABOUT_FACT_LABELS;

export type AboutFacts = Readonly<Record<AboutFactKey, string | null>>;

export const ABOUT_FACTS: AboutFacts = {
  founded: null,
  team: null,
  office: null,
  platforms: null,
};
