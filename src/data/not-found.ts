// 404 页（src/pages/404.astro）的文字。
//
// ⚠️ 草稿：交接包里没有 404 页的文案，也没有设计稿。
// P-06 按用户的要求先写了草稿，等用户看过再定（Issue #17）。定稿后只改这里。

import { HOME_HREF } from './site';

/** 页面标题，照子页面的写法：「ClinkAI」加页面名（设计稿里是「ClinkAI 预约沟通」「ClinkAI 关于我们」） */
export const NOT_FOUND_TITLE = 'ClinkAI 页面不存在';

/** 英文大标题，一项一行 */
export const NOT_FOUND_HEADING = ['NOT', 'FOUND.'] as const;

/** 标题下面的那段话，也用作这一页的描述 */
export const NOT_FOUND_LEAD =
  '这个地址没有对应的页面。可能是链接写错了，或者页面已经搬走。';

/** 回首页的按钮。箭头单独放，读屏时不念 */
export const NOT_FOUND_HOME = { label: '回首页', arrow: '→', href: HOME_HREF };
