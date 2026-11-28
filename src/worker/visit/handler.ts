// POST /api/visit：访问统计的记数接口（P-06）。页面打开时，打包进站点的小脚本往这里发一条。
// 每条只记四项（schema.ts 的 VISIT_FIELDS）：页面路径、来源网站的域名、国家或地区、手机还是电脑，
// 写进 Workers Analytics Engine。
//
// 不做的事：不读 IP，不读也不写 cookie，不保存 User-Agent（只当场用来分手机还是电脑、认爬虫），
// 不给访客编号，不记日志（只有写入出错时记一行错误码）。
// 这个接口不能影响页面：除了方法不对，一律回 204，记没记上页面都不知道、也不需要知道。
// 说明见 docs/analytics.md。

import { jsonResponse } from '../contact/handler';
import type { Env } from '../env';
import { readLimited } from '../read-limited';
import {
  cleanCountry,
  cleanPath,
  cleanReferrer,
  deviceClass,
  isBot,
  MAX_VISIT_BODY_BYTES,
  VISIT_FIELDS,
  VISIT_PATH,
  type VisitField,
} from './schema';

/** Cloudflare 在请求上附带的信息，这里只用国家或地区 */
type VisitRequest = Request & { cf?: { country?: unknown } };

function noContent(): Response {
  return new Response(null, {
    status: 204,
    headers: { 'cache-control': 'no-store' },
  });
}

/** 页面脚本发来的 JSON。读不出来、太大、不是对象，都返回 null */
async function readReport(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const type = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('application/json')) return null;
  if (Number(request.headers.get('content-length')) > MAX_VISIT_BODY_BYTES) {
    return null;
  }
  try {
    const bytes = await readLimited(request.body, MAX_VISIT_BODY_BYTES);
    if (bytes === null) return null;
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function handleVisit(
  request: VisitRequest,
  env: Env,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse(
      405,
      { ok: false, error: 'method_not_allowed' },
      { allow: 'POST' },
    );
  }

  // 没有绑定（PR 预览、没配好的环境）：不记
  const dataset = env.VISITS;
  if (!dataset) return noContent();

  // 只收本站页面发来的：浏览器发 POST 时会带 Origin
  const { origin, hostname } = new URL(request.url);
  if (request.headers.get('origin') !== origin) return noContent();

  const userAgent = request.headers.get('user-agent');
  if (isBot(userAgent)) return noContent();

  const report = await readReport(request);
  const path = report && cleanPath(report.path);
  if (!report || !path) return noContent();

  const record: Record<VisitField, string> = {
    path,
    referrer: cleanReferrer(report.referrer, hostname),
    country: cleanCountry(request.cf?.country),
    device: deviceClass(userAgent),
  };

  try {
    dataset.writeDataPoint({
      indexes: [path],
      blobs: VISIT_FIELDS.map((field) => record[field]),
    });
  } catch (error) {
    // 只记错误的名字，不记内容
    const detail = error instanceof Error ? error.name : 'unknown';
    console.error(
      JSON.stringify({ route: VISIT_PATH, outcome: 'write_failed', detail }),
    );
  }
  return noContent();
}
