import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import copyMd from '../design/copy.md?raw';
import ContactDetails from '../src/components/contact/ContactDetails.astro';
import ContactForm from '../src/components/contact/ContactForm.astro';
import { CONTACT_COPY, CONTACT_TODO } from '../src/data/contact';
import { CONTACT_CTA } from '../src/data/site';
import ContactPage from '../src/pages/contact.astro';
import { CONTACT_PATH } from '../src/worker/contact/handler';
import {
  buildContactFields,
  CONTACT_FIELDS,
} from '../src/worker/contact/schema';

let container: AstroContainer;
let page: string;

beforeAll(async () => {
  container = await AstroContainer.create();
  page = await container.renderToString(ContactPage);
});

// 去掉标签，只看读得到的文字
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const main = (html: string) => html.match(/<main[\s\S]*<\/main>/)?.[0] ?? '';

// design/copy.md「子页面 · 预约沟通」一节：前半是页面上看得见的字，后半是占位文字
function designCopy() {
  const start = copyMd.indexOf('## 子页面 · 预约沟通');
  const section = copyMd.slice(start, copyMd.indexOf('\n## ', start + 1));
  const [visible = '', placeholders = ''] =
    section.split('无障碍说明和占位文字：');
  const items = (block: string) =>
    [...block.matchAll(/^- (.+)$/gm)].map((match) => match[1]!);
  return { visible: items(visible), placeholders: items(placeholders) };
}

// 【待填】没补齐时整块隐藏的字：左下角的联系方式、月预算
const DETAILS = ['邮箱', '【待填：邮箱】', '微信', '【待填：微信号】'];
const BUDGET = ['月预算', '【待填：预算区间】', '先聊聊再说'];
const EXAMPLE_TIERS = ['档一（示例）', '档二（示例）'];

/** 标题在 copy.md 里写成「LET’S / TALK」，斜杠表示换行 */
const readable = (items: string[]) => items.join(' ').replace(' / ', ' ');

describe('预约沟通页', () => {
  it('copy.md 里这一页的文案读得出来（防止读错文件导致空比空）', () => {
    const { visible, placeholders } = designCopy();

    expect(visible[0]).toBe('LET’S / TALK');
    expect(visible.at(-1)).toBe('提交，预约沟通 →');
    expect(visible).toEqual(expect.arrayContaining([...DETAILS, ...BUDGET]));
    expect(placeholders).toEqual(['微信 / 邮箱 / 电话']);
  });

  it('页面上的字照抄 copy.md，不多不少；【待填】的两块整块不出现', () => {
    const expected = designCopy().visible.filter(
      (item) => !DETAILS.includes(item) && !BUDGET.includes(item),
    );

    expect(text(main(page))).toBe(readable(expected));
  });

  it('整页没有【待填】字样，也没有 Turnstile', () => {
    expect(page).not.toContain('待填');
    expect(page).not.toMatch(/turnstile|challenges\.cloudflare/i);
  });

  it('标题照设计稿：页面标题、英文大标题标成英文、句号是装饰', () => {
    expect(page).toContain('<title>ClinkAI 预约沟通</title>');
    expect(text(page.match(/<h1[^>]*lang="en"[\s\S]*?<\/h1>/)?.[0] ?? '')).toBe(
      'LET’S TALK',
    );
    expect(page).toMatch(
      /<span[^>]*class="period[^"]*"[^>]*aria-hidden="true"/,
    );
  });

  it('普通页头，「预约沟通」标成当前页，链接是这一页的真实地址', () => {
    expect(CONTACT_CTA.href).toBe('/contact/');
    expect(page).toMatch(/class="[^"]*\bsite-header\b[^"]*\bplain\b/);
    expect(page.match(/aria-current="page"/g)).toHaveLength(1);
    expect(page).toMatch(
      /<a[^>]*class="cta[^"]*"[^>]*href="\/contact\/"[^>]*aria-current="page"/,
    );
  });

  it('角落部件：有圆点和菜单按钮，没有 SCROLL', () => {
    expect(page).toContain('sound-dot');
    expect(page).toContain('aria-label="打开菜单"');
    expect(page).not.toContain('SCROLL');
  });
});

describe('预约沟通页的表单', () => {
  it('提交到表单接口；没有脚本时也能用普通表单提交', () => {
    expect(page).toMatch(
      new RegExp(
        `<form[^>]*action="${CONTACT_PATH}"[^>]*method="post"[^>]*data-contact-form`,
      ),
    );
    expect(page).toMatch(/<button type="submit"[^>]*>\s*提交，预约沟通 →/);
  });

  it('字段表里的每个字段都有同名的控件', () => {
    for (const field of CONTACT_FIELDS) {
      expect(page, field.name).toMatch(
        new RegExp(`<(input|select|textarea)[^>]*name="${field.name}"`),
      );
    }
    expect(page).not.toMatch(/name="budget"/);
  });

  it('必填和长度上限从字段表来：单行和多行字段带 required 和 maxlength', () => {
    for (const field of CONTACT_FIELDS) {
      if (!('maxLength' in field)) continue;
      const control =
        page.match(
          new RegExp(`<(?:input|textarea)[^>]*name="${field.name}"[^>]*>`),
        )?.[0] ?? '';

      expect(control, field.name).toContain(`maxlength="${field.maxLength}"`);
      expect(/\srequired\b/.test(control), field.name).toBe(field.required);
    }
  });

  it('控件的类型和占位文字照设计稿', () => {
    const [placeholder] = designCopy().placeholders;

    expect(page).toMatch(/<input[^>]*type="text"[^>]*name="brand"/);
    expect(page).toMatch(/<input[^>]*type="url"[^>]*name="site"/);
    expect(page).toMatch(
      new RegExp(
        `<input[^>]*type="text"[^>]*name="contact"[^>]*placeholder="${placeholder}"`,
      ),
    );
    expect(page).toMatch(/<textarea[^>]*name="note"[^>]*rows="3"/);
    expect(page.match(/type="checkbox" name="market"/g)).toHaveLength(7);
    expect(page.match(/type="checkbox" name="service"/g)).toHaveLength(6);
  });

  it('每个字段都有放错误提示的位置，一开始是空的、藏着的', () => {
    for (const field of CONTACT_FIELDS) {
      expect(page, field.name).toMatch(
        new RegExp(
          `<[a-z]+[^>]*data-error-for="${field.name}"[^>]*hidden[^>]*></`,
        ),
      );
    }
  });

  it('有一块给读屏播报提交结果的区域，一开始是空的', () => {
    expect(page).toMatch(
      /<p[^>]*role="status"[^>]*data-contact-status[^>]*><\/p>/,
    );
  });

  it('提示语和隐私说明的文案还没到：全是空的，隐私说明那一块不渲染', () => {
    const pending = [
      CONTACT_COPY.privacy,
      CONTACT_COPY.success,
      CONTACT_COPY.invalid,
      CONTACT_COPY.rateLimited,
      CONTACT_COPY.failed,
      CONTACT_COPY.duplicate,
      ...Object.values(CONTACT_COPY.fieldErrors),
    ];

    expect(pending.every((value) => value === null)).toBe(true);
    expect(page).not.toContain('data-contact-privacy');
  });

  it('隐私说明的文案到了以后，显示在表单里', async () => {
    const html = await container.renderToString(ContactForm, {
      props: { copy: { ...CONTACT_COPY, privacy: '隐私说明（测试用）' } },
    });

    expect(html).toMatch(
      /<p[^>]*data-contact-privacy[^>]*>\s*隐私说明（测试用）\s*<\/p>/,
    );
  });

  it('把字段表和提示语交给提交脚本', async () => {
    const html = await container.renderToString(ContactForm);
    const attribute = (name: string) => {
      const raw = html.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? '';
      return JSON.parse(
        raw.replaceAll('&quot;', '"').replaceAll('&amp;', '&'),
      ) as unknown;
    };

    expect(attribute('data-fields')).toEqual(
      JSON.parse(JSON.stringify(CONTACT_FIELDS)),
    );
    expect(attribute('data-copy')).toEqual(CONTACT_COPY);
  });
});

describe('【待填】：月预算', () => {
  it('分档现在还没补齐', () => {
    expect(CONTACT_TODO.budgetTiers).toBeNull();
  });

  it('没补齐时月预算整块不渲染，「怎么联系你」单独占一行', async () => {
    const html = await container.renderToString(ContactForm, {
      props: { budgetTiers: null },
    });

    expect(html).not.toContain('月预算');
    expect(html).not.toContain('先聊聊再说');
    expect(html).not.toContain('<select');
    expect(html).toMatch(/class="form-row single[^"]*"/);
  });

  it('补齐后显示下拉：各档加「先聊聊再说」，和「怎么联系你」并排', async () => {
    const html = await container.renderToString(ContactForm, {
      props: { budgetTiers: EXAMPLE_TIERS },
    });
    const expected = designCopy()
      .visible.filter((item) => !DETAILS.includes(item))
      .slice(2)
      .flatMap((item) =>
        item === '【待填：预算区间】' ? EXAMPLE_TIERS : item,
      );

    expect(text(html)).toBe(readable(expected));
    expect(html).toMatch(/<select[^>]*name="budget"/);
    expect(html.match(/<option>/g)).toHaveLength(3);
    expect(html).not.toMatch(/class="form-row single/);
    expect(html).toContain(
      JSON.stringify(buildContactFields(EXAMPLE_TIERS))
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;'),
    );
  });
});

describe('【待填】：联系邮箱和微信号', () => {
  it('现在都还没补齐', () => {
    expect(CONTACT_TODO.email).toBeNull();
    expect(CONTACT_TODO.wechat).toBeNull();
  });

  it('都没补齐时整块不渲染', async () => {
    const html = await container.renderToString(ContactDetails, {
      props: { email: null, wechat: null },
    });

    expect(html.trim()).toBe('');
  });

  it('补齐后按设计稿显示两行', async () => {
    const html = await container.renderToString(ContactDetails, {
      props: { email: 'hello@clinkai.example', wechat: 'clinkai-example' },
    });

    expect(html).toMatch(/^\s*<dl/);
    expect(text(html)).toBe('邮箱 hello@clinkai.example 微信 clinkai-example');
  });

  it('只补了一项时只显示那一行', async () => {
    const html = await container.renderToString(ContactDetails, {
      props: { email: 'hello@clinkai.example', wechat: null },
    });

    expect(text(html)).toBe('邮箱 hello@clinkai.example');
  });
});
