// 访问统计的页面脚本（P-06）：页面打开时往自己的记数接口发一条。
// 打包进站点，不从任何外部地址加载；不读不写 cookie，不存任何东西到浏览器里。
// 发出去的只有两项（VisitReport）：这一页的路径和来源网站的域名。
// 发不出去、接口没回，都不管：统计不能影响页面。说明见 docs/analytics.md。

import { VISIT_PATH, type VisitReport } from '../worker/visit/schema';

/** BaseLayout 写在 <body> 上的属性：这一页的规范路径 */
export const VISIT_PATH_ATTRIBUTE = 'data-visit-path';

/** 脚本用到的浏览器环境，就这几样。测试里传假的 */
export interface VisitWindow {
  document: {
    referrer: string;
    body: { getAttribute(name: string): string | null } | null;
  };
  location: { hostname: string };
  navigator: { webdriver?: boolean };
  fetch: typeof fetch;
}

/** 来源只留域名：完整的来源地址（可能带搜索词）不离开浏览器。站内跳转不算来源 */
export function referrerHost(referrer: string, ownHost: string): string {
  if (!referrer) return '';
  try {
    const { hostname } = new URL(referrer);
    return hostname === ownHost ? '' : hostname;
  } catch {
    return '';
  }
}

/** 要发的内容。页面上没有路径（不是 BaseLayout 出的页面）时返回 null，不发 */
export function buildVisitReport(win: VisitWindow): VisitReport | null {
  const path = win.document.body?.getAttribute(VISIT_PATH_ATTRIBUTE);
  if (!path) return null;
  return {
    path,
    referrer: referrerHost(win.document.referrer, win.location.hostname),
  };
}

export function reportVisit(win: VisitWindow = window): void {
  // 自动化测试和截图用的浏览器不算访问
  if (win.navigator.webdriver) return;

  const report = buildVisitReport(win);
  if (!report) return;

  try {
    win
      .fetch(VISIT_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(report),
        // 不带 cookie；页面马上被关掉也尽量发出去
        credentials: 'omit',
        keepalive: true,
      })
      .catch(() => {});
  } catch {
    // 发不了就算了
  }
}
