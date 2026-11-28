import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { unstable_readConfig } from 'wrangler';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONTACT_TODO, FIELD_LABELS } from '../src/data/contact';
import {
  PRIVACY_DESCRIPTION,
  PRIVACY_HEADING,
  PRIVACY_LEAD,
  PRIVACY_TITLE,
  PRIVACY_UPDATED,
  PRIVACY_UPDATED_LABEL,
  privacySections,
} from '../src/data/privacy';
import PrivacyPage from '../src/pages/privacy.astro';
import { CONTACT_FIELDS } from '../src/worker/contact/schema';

// 隐私说明页（P-06）。文字是草稿（src/data/privacy.ts）。
// 这里查两件事：页面照着那份文字渲染；说明里讲的事实和代码对得上，代码变了测试会提醒改说明。

let page: string;

beforeAll(async () => {
  const container = await AstroContainer.create();
  page = await container.renderToString(PrivacyPage);
});

// 去掉标签，只看读得到的文字
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const main = (html: string) => html.match(/<main[\s\S]*<\/main>/)?.[0] ?? '';

const labels: Record<string, string> = FIELD_LABELS;
const currentLabels = CONTACT_FIELDS.map((field) => labels[field.name]!);
const sections = privacySections({
  fieldLabels: currentLabels,
  email: CONTACT_TODO.email,
});

describe('隐私说明页', () => {
  it('标题和描述；会被收录', () => {
    expect(page).toContain(`<title>${PRIVACY_TITLE}</title>`);
    expect(page).toContain(
      `<meta name="description" content="${PRIVACY_DESCRIPTION}">`,
    );
    expect(page).not.toContain('noindex');
  });

  it('页面上的字就是草稿里的那几段，不多不少，顺序也一样', () => {
    const expected = [
      ...PRIVACY_HEADING,
      PRIVACY_LEAD,
      ...sections.flatMap((section) => [
        section.title,
        ...section.blocks.flat(),
        ...(section.contactLink ? ['预约沟通 →'] : []),
      ]),
      `${PRIVACY_UPDATED_LABEL}： ${PRIVACY_UPDATED}`,
    ];

    expect(text(main(page))).toBe(expected.join(' '));
  });

  it('只有一个一级标题，标成英文；每一节一个二级标题', () => {
    expect(page.match(/<h1\b/g)).toHaveLength(1);
    expect(text(page.match(/<h1[^>]*lang="en"[\s\S]*?<\/h1>/)?.[0] ?? '')).toBe(
      PRIVACY_HEADING.join(' '),
    );
    expect(page.match(/<h2\b/g)).toHaveLength(sections.length);
    for (const section of sections) {
      expect(page).toMatch(
        new RegExp(`<section[^>]*aria-labelledby="${section.id}"`),
      );
    }
  });

  it('最后更新的日期是机器读得懂的格式', () => {
    expect(PRIVACY_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(page).toContain(`<time datetime="${PRIVACY_UPDATED}"`);
  });

  it('有去预约沟通页的链接', () => {
    expect(page).toMatch(
      /<a[^>]*class="contact-link[^"]*"[^>]*href="\/contact\/"/,
    );
  });

  it('普通页头，角落部件没有 SCROLL', () => {
    expect(page).toMatch(/class="[^"]*\bsite-header\b[^"]*\bplain\b/);
    expect(page).toContain('aria-label="打开菜单"');
    expect(page).not.toContain('SCROLL');
  });

  it('不出现不能写的话和【待填】', () => {
    for (const word of ['飞轮', '越用越准', '品类经验库', '复盘', '待填']) {
      expect(text(page)).not.toContain(word);
    }
  });
});

describe('隐私说明里的事实和代码对得上', () => {
  it('「我们会收到你填写的这几项」：就是接口字段表里现在收的那几项', () => {
    expect(currentLabels.length).toBeGreaterThan(0);
    expect(currentLabels.every(Boolean)).toBe(true);

    const list = /<ul[^>]*>[\s\S]*?<\/ul>/.exec(page)?.[0] ?? '';
    const items = [...list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(
      (match) => text(match[1]!),
    );

    expect(items).toEqual(currentLabels);
  });

  it('月预算还是【待填】时不在这几项里；补齐后自动出现', () => {
    expect(CONTACT_TODO.budgetTiers).toBeNull();
    expect(currentLabels).not.toContain(FIELD_LABELS.budget);

    const withBudget = privacySections({
      fieldLabels: [...currentLabels, FIELD_LABELS.budget],
      email: null,
    });
    expect(withBudget[0]!.blocks.flat()).toContain(FIELD_LABELS.budget);
  });

  it('联系邮箱还是【待填】时不提邮箱；补齐后写出来', () => {
    expect(CONTACT_TODO.email).toBeNull();
    expect(text(page)).not.toContain('邮件到');

    const withEmail = privacySections({
      fieldLabels: currentLabels,
      email: 'hello@clinkai.example',
    });
    expect(withEmail.at(-1)!.blocks.join('')).toContain(
      '发邮件到 hello@clinkai.example',
    );
  });

  const sources = import.meta.glob<string>('../src/**/*.{astro,ts,js}', {
    query: '?raw',
    import: 'default',
    eager: true,
  });
  const code = Object.entries(sources).filter(
    ([path]) => !path.endsWith('.test.ts'),
  );

  it('「不使用 cookie」：站点代码不读不写 cookie', () => {
    expect(code.length).toBeGreaterThan(10);
    for (const [path, source] of code) {
      expect(source, path).not.toMatch(
        /document\.cookie|cookieStore|set-cookie/i,
      );
    }
  });

  // 「不加载第三方脚本」由 tests/no-online-assets.test.ts 盯着；
  // 「日志里不记录表单内容和联系方式」「IP 不写进日志」由 src/worker/contact/handler.test.ts 盯着。

  it('「目前没有访问统计」：没有统计用的绑定。加统计的那一单要同时改隐私说明', () => {
    const config = unstable_readConfig({ config: 'wrangler.jsonc' });

    expect(config.analytics_engine_datasets ?? []).toEqual([]);
    expect(sections.flatMap((section) => section.blocks.flat())).toContain(
      '这个网站目前没有访问统计。',
    );
  });

  it('「按 IP 地址限制提交次数」：表单接口有限流绑定', () => {
    const config = unstable_readConfig({ config: 'wrangler.jsonc' });

    expect(
      config.ratelimits.map((binding: { name: string }) => binding.name),
    ).toEqual(['CONTACT_RATE_LIMITER']);
  });

  it('「不存进数据库」：Worker 没有任何存储类的绑定', () => {
    const config = unstable_readConfig({ config: 'wrangler.jsonc' });

    expect(config.kv_namespaces ?? []).toEqual([]);
    expect(config.d1_databases ?? []).toEqual([]);
    expect(config.r2_buckets ?? []).toEqual([]);
    expect(config.durable_objects?.bindings ?? []).toEqual([]);
  });
});
