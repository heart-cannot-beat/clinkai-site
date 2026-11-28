// Worker 入口：表单接口 POST /api/contact，访问统计的记数接口 POST /api/visit。
// wrangler.jsonc 里 run_worker_first 只放了 /api/*，
// 其余路径由静态资源直接返回（找不到时返回 404 页），正常不会进到这里；
// 最后一行把请求交还给静态资源，只是兜底。

import { CONTACT_PATH, handleContact, jsonResponse } from './contact/handler';
import type { Env } from './env';
import { handleVisit } from './visit/handler';
import { VISIT_PATH } from './visit/schema';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === CONTACT_PATH) return handleContact(request, env);
    if (pathname === VISIT_PATH) return handleVisit(request, env);
    if (pathname.startsWith('/api/')) {
      return jsonResponse(404, { ok: false, error: 'not_found' });
    }

    return env.ASSETS.fetch(request);
  },
};
