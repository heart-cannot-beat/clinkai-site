// 看访问统计（P-06）：用 Cloudflare 的 SQL 接口查 Workers Analytics Engine 里的访问记录。用法：
//
//   node scripts/visits.mjs          最近 7 天
//   node scripts/visits.mjs 30       最近 30 天（最多 90，数据只保留三个月）
//   node scripts/visits.mjs --sql    只把要跑的 SQL 打出来，不联网
//
// 要两个环境变量，都只放在自己的终端里，不进仓库，不写进 CI：
//   CLOUDFLARE_ACCOUNT_ID   账号 ID
//   CLOUDFLARE_API_TOKEN    在 Cloudflare 后台建的 API Token，权限只要 Account Analytics: Read
// 建 Token 的步骤和官方链接见 docs/analytics.md。需要 Node 22.18 以上（直接读 .ts 文件）。

import { visitQueries } from '../src/worker/visit/schema.ts';

const args = process.argv.slice(2);
const printOnly = args.includes('--sql');
const daysArg = args.find((arg) => !arg.startsWith('--'));

let queries;
try {
  queries = visitQueries(daysArg === undefined ? 7 : Number(daysArg));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

if (printOnly) {
  for (const { title, sql } of queries) console.log(`-- ${title}\n${sql};\n`);
  process.exit(0);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!accountId || !token) {
  console.error(
    '要先设两个环境变量：CLOUDFLARE_ACCOUNT_ID 和 CLOUDFLARE_API_TOKEN（权限 Account Analytics: Read）。步骤见 docs/analytics.md。',
  );
  process.exit(1);
}

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`;

/** 把结果打成两列的表。第一列空的写成「（空）」 */
function printTable(title, column, rows) {
  console.log(`\n${title}`);
  if (rows.length === 0) {
    console.log('  （没有数据）');
    return;
  }
  const labels = rows.map((row) => String(row[column] ?? '') || '（空）');
  const width = Math.max(...labels.map((label) => label.length));
  rows.forEach((row, index) => {
    console.log(`  ${labels[index].padEnd(width)}  ${row.views}`);
  });
}

let failed = false;
for (const { title, column, sql } of queries) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: sql,
  });
  if (!response.ok) {
    failed = true;
    // 出错时只打状态码和接口回的说明，不把 Token 打出来
    console.error(`\n${title}：查询失败（HTTP ${response.status}）`);
    console.error(`  ${(await response.text()).slice(0, 500)}`);
    continue;
  }
  const result = await response.json();
  printTable(title, column, result.data ?? []);
}

process.exit(failed ? 1 : 0);
