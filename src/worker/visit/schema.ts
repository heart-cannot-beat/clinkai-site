// 访问统计（P-06）的约定：一条访问记录里有什么、每一项怎么清洗、数据怎么查。
// 记数接口（handler.ts）、页面脚本（src/visit/report.ts）、查数据的命令（scripts/visits.mjs）
// 和隐私说明页都从这里读，别处不再写字段。说明见 docs/analytics.md。
//
// 这个文件不引别的文件、只用能直接擦掉的类型写法：scripts/visits.mjs 用 Node 直接读它。

/** 记数接口的地址 */
export const VISIT_PATH = '/api/visit';

/** Workers Analytics Engine 的数据集名，和 wrangler.jsonc 里 VISITS 绑定的 dataset 一致 */
export const VISIT_DATASET = 'clinkai_site_visits';

/**
 * 一条访问记录里的全部内容，就这四项，顺序就是数据集里 blob1–blob4 的顺序。
 * 没有 IP、没有 cookie、没有访客编号、没有完整的来源地址、没有浏览器信息原文。
 * 要加一项：先问用户，再改这里；隐私说明页会跟着多出一行（src/data/privacy.ts）。
 */
export const VISIT_FIELDS = ['path', 'referrer', 'country', 'device'] as const;

export type VisitField = (typeof VISIT_FIELDS)[number];

/** 页面脚本发给接口的内容：只有这两项，国家和设备由接口自己判断 */
export interface VisitReport {
  /** 页面的规范路径，构建时写在页面上（不是地址栏里的地址），比如 /contact/ */
  path: string;
  /** 来源网站的域名；没有来源或者是站内跳转时是空的 */
  referrer: string;
}

/** 请求体上限。正常的一条不到 200 字节 */
export const MAX_VISIT_BODY_BYTES = 1024;

/** 路径最长 96 个字符：它同时用作数据集的索引，Analytics Engine 的索引上限是 96 字节 */
export const MAX_VISIT_PATH_LENGTH = 96;

export const MAX_REFERRER_LENGTH = 100;

/**
 * 路径只收站点自己的页面路径那种写法：以斜杠开头，只有字母、数字、斜杠、连字符和下划线。
 * 不带查询串和锚点。不合要求的返回 null，这一条就不记。
 */
export function cleanPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length > MAX_VISIT_PATH_LENGTH) return null;
  return /^\/[A-Za-z0-9/_-]*$/.test(value) ? value : null;
}

/**
 * 来源只留域名：小写，只收域名那种写法。站内跳转（和本站同一个域名）不算来源。
 * 不合要求的一律当成没有来源，这一条照记。
 */
export function cleanReferrer(value: unknown, ownHost: string): string {
  if (typeof value !== 'string') return '';
  const host = value.toLowerCase();
  if (host.length > MAX_REFERRER_LENGTH) return '';
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host)) return '';
  return host === ownHost.toLowerCase() ? '' : host;
}

/** Cloudflare 给的国家或地区代码：两位大写字母或数字。别的一律当成不知道 */
export function cleanCountry(value: unknown): string {
  return typeof value === 'string' && /^[A-Z0-9]{2}$/.test(value) ? value : '';
}

export type DeviceClass = 'mobile' | 'desktop';

/** 手机还是电脑，从 User-Agent 粗分：带 Mobi 的算手机，其余（含平板和认不出的）算电脑 */
export function deviceClass(userAgent: string | null): DeviceClass {
  return /Mobi/i.test(userAgent ?? '') ? 'mobile' : 'desktop';
}

/** 自报家门的爬虫、无界面浏览器和检测工具不算访问；没有 User-Agent 的也不算 */
export function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|monitor|uptime/i.test(
    userAgent,
  );
}

export interface VisitQuery {
  title: string;
  /** 结果里第一列的列名（第二列都是 views） */
  column: string;
  sql: string;
}

/**
 * 查最近几天的访问量：按天、按页面、按来源、按国家或地区、按设备。
 * 语法是 Analytics Engine 的 SQL 接口的（见 docs/analytics.md 里的官方链接）：
 * 条数用 SUM(_sample_interval) 算，量大被抽样时也是对的。
 */
export function visitQueries(days: number): VisitQuery[] {
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error('天数要是 1 到 90 的整数（数据只保留三个月）');
  }
  const blob = (field: VisitField) => `blob${VISIT_FIELDS.indexOf(field) + 1}`;
  const from = `FROM ${VISIT_DATASET} WHERE timestamp > NOW() - INTERVAL '${days}' DAY`;
  const by = (column: string, expression: string, order: string) =>
    `SELECT ${expression} AS ${column}, SUM(_sample_interval) AS views ${from} GROUP BY ${column} ORDER BY ${order} LIMIT 100`;

  return [
    {
      title: '每天',
      column: 'day',
      sql: by('day', "toStartOfInterval(timestamp, INTERVAL '1' DAY)", 'day'),
    },
    {
      title: '页面',
      column: 'path',
      sql: by('path', blob('path'), 'views DESC'),
    },
    {
      title: '来源网站（空的是直接打开或站内跳转）',
      column: 'referrer',
      sql: by('referrer', blob('referrer'), 'views DESC'),
    },
    {
      title: '国家或地区',
      column: 'country',
      sql: by('country', blob('country'), 'views DESC'),
    },
    {
      title: '设备',
      column: 'device',
      sql: by('device', blob('device'), 'views DESC'),
    },
  ];
}
