import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import CounterBlock from '../src/components/CounterBlock.astro';
import ExampleTag from '../src/components/ExampleTag.astro';
import MenuButton from '../src/components/MenuButton.astro';
import ScreenCorners from '../src/components/ScreenCorners.astro';
import SectionLabel from '../src/components/SectionLabel.astro';
import SiteHeader from '../src/components/SiteHeader.astro';
import StatusTag from '../src/components/StatusTag.astro';
import ChoiceGroup from '../src/components/form/ChoiceGroup.astro';
import SelectField from '../src/components/form/SelectField.astro';
import SubmitButton from '../src/components/form/SubmitButton.astro';
import TextAreaField from '../src/components/form/TextAreaField.astro';
import TextField from '../src/components/form/TextField.astro';
import PartsPage from '../src/pages/parts.astro';

let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

// 去掉标签，只看读得到的文字
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('页头', () => {
  it('导航文字照抄 design/copy.md，顺序不变', async () => {
    const html = await container.renderToString(SiteHeader);

    expect(text(html)).toBe(
      'CLINKAI 增长服务 ↗ 作品 ↗ 我们的产品 ↗ 关于我们 ↗ 预约沟通 →',
    );
    expect(html).toContain('aria-label="ClinkAI 首页"');
    expect(html).toMatch(/<nav\b/);
  });

  it('默认是普通页头、墨色字', async () => {
    const html = await container.renderToString(SiteHeader);

    expect(html).toMatch(
      /class="[^"]*\bsite-header\b[^"]*\bplain\b[^"]*\bink\b/,
    );
  });

  it('深色底用纸色字', async () => {
    const html = await container.renderToString(SiteHeader, {
      props: { tone: 'paper' },
    });

    expect(html).toMatch(/class="[^"]*\bplain\b[^"]*\bpaper\b/);
  });

  it('胶囊页头不带 tone 类', async () => {
    const html = await container.renderToString(SiteHeader, {
      props: { variant: 'pill', tone: 'paper' },
    });

    expect(html).toMatch(/class="[^"]*\bsite-header\b[^"]*\bpill\b/);
    expect(html).not.toMatch(/class="[^"]*\bsite-header\b[^"]*\bpaper\b/);
  });

  it('当前页只标在对应的那一项上', async () => {
    const html = await container.renderToString(SiteHeader, {
      props: { current: 'products' },
    });

    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>\s*我们的产品 ↗/);
  });

  it('在预约沟通页时标在「预约沟通」按钮上', async () => {
    const html = await container.renderToString(SiteHeader, {
      props: { current: 'contact' },
    });

    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/class="cta[^"]*"[^>]*aria-current="page"/);
  });

  it('「预约沟通」后面的箭头对读屏隐藏', async () => {
    const html = await container.renderToString(SiteHeader);

    expect(html).toMatch(/<span aria-hidden="true"[^>]*>→<\/span>/);
  });
});

describe('角落部件', () => {
  it('菜单按钮有无障碍名称「打开菜单」，图标对读屏隐藏', async () => {
    const html = await container.renderToString(MenuButton);

    expect(html).toMatch(/<button type="button"[^>]*aria-label="打开菜单"/);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it('默认没有 SCROLL，有圆点和菜单按钮', async () => {
    const html = await container.renderToString(ScreenCorners);

    expect(html).not.toContain('SCROLL');
    expect(html).toMatch(/class="sound-dot ink[^"]*"[^>]*aria-hidden="true"/);
    expect(html).toContain('aria-label="打开菜单"');
  });

  it('scroll 时显示「SCROLL ↓」；深色底时圆点和 SCROLL 换成纸色', async () => {
    const html = await container.renderToString(ScreenCorners, {
      props: { scroll: true, tone: 'paper' },
    });

    expect(text(html)).toContain('SCROLL ↓');
    expect(html).toMatch(/class="sound-dot paper/);
    expect(html).toMatch(/class="scroll-hint paper/);
  });
});

describe('计数块', () => {
  it('显示小节名、数字和两行说明', async () => {
    const html = await container.renderToString(CounterBlock, {
      props: {
        label: '03 / 广告投放 · 出素材',
        value: 40,
        lines: ['个版本，同一个创意', '7 种语言 · 4 种尺寸 · 示例'],
      },
    });

    expect(text(html)).toBe(
      '03 / 广告投放 · 出素材 40 个版本，同一个创意 7 种语言 · 4 种尺寸 · 示例',
    );
    expect(html).toMatch(/<h2[^>]*>03 \/ 广告投放 · 出素材<\/h2>/);
  });

  it.each([
    [40, 2],
    [1, 1],
    [8, 1],
  ])('数字 %i 按 %i 位数放说明', async (value, digits) => {
    const html = await container.renderToString(CounterBlock, {
      props: { label: '标签', value, lines: ['一', '二'] },
    });

    expect(html).toContain(`--digits: ${digits}`);
  });
});

describe('小节标签', () => {
  it('圆点对读屏隐藏，文字照传入的写', async () => {
    const html = await container.renderToString(SectionLabel, {
      props: { as: 'h2' },
      slots: { default: '04 / 达人营销 · 示例内容' },
    });

    expect(html).toMatch(/^<h2 class="section-label/);
    expect(html).toMatch(
      /<span class="dot"[^>]*aria-hidden="true"[^>]*><\/span>/,
    );
    expect(text(html)).toBe('04 / 达人营销 · 示例内容');
  });
});

describe('「示例」标签', () => {
  it('默认文字是「示例」', async () => {
    const html = await container.renderToString(ExampleTag);

    expect(text(html)).toBe('示例');
    expect(html).toMatch(/class="example-tag text/);
  });

  it('细线框样子可以换文字', async () => {
    const html = await container.renderToString(ExampleTag, {
      props: { variant: 'outline' },
      slots: { default: '示例广告 · 非真实客户' },
    });

    expect(text(html)).toBe('示例广告 · 非真实客户');
    expect(html).toMatch(/class="example-tag outline/);
  });
});

describe('状态小标签', () => {
  it.each(['ok', 'wait', 'unknown'] as const)('%s', async (status) => {
    const html = await container.renderToString(StatusTag, {
      props: { status },
      slots: { default: '已确认' },
    });

    expect(html).toMatch(new RegExp(`class="status-tag ${status}`));
    expect(text(html)).toBe('已确认');
  });
});

describe('表单控件', () => {
  it('输入框：标签包住控件，name 和 type 照传', async () => {
    const html = await container.renderToString(TextField, {
      props: { label: '官网或店铺链接', name: 'site', type: 'url' },
    });

    expect(html).toMatch(/^<label class="field/);
    expect(text(html)).toBe('官网或店铺链接');
    expect(html).toMatch(/<input[^>]*type="url"[^>]*name="site"/);
  });

  it('下拉：每个选项都在', async () => {
    const html = await container.renderToString(SelectField, {
      props: {
        label: '月预算',
        name: 'budget',
        options: ['【待填：预算区间】', '先聊聊再说'],
      },
    });

    expect(html).toMatch(/<select[^>]*name="budget"/);
    expect(html.match(/<option>/g)).toHaveLength(2);
  });

  it('多行文本默认 3 行', async () => {
    const html = await container.renderToString(TextAreaField, {
      props: { label: '补充说明（选填）', name: 'note' },
    });

    expect(html).toMatch(/<textarea[^>]*name="note"[^>]*rows="3"/);
  });

  it('多选胶囊：fieldset 加 legend，每项一个复选框', async () => {
    const html = await container.renderToString(ChoiceGroup, {
      props: {
        legend: '想去的市场',
        name: 'market',
        options: ['北美', '欧洲'],
      },
    });

    expect(html).toMatch(/<fieldset[^>]*>\s*<legend[^>]*>想去的市场<\/legend>/);
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).toMatch(/name="market" value="欧洲"/);
  });

  it('提交按钮是 submit 类型，文字照传', async () => {
    const html = await container.renderToString(SubmitButton, {
      slots: { default: '提交，预约沟通 →' },
    });

    expect(html).toMatch(/<button type="submit"/);
    expect(text(html)).toBe('提交，预约沟通 →');
  });
});

describe('部件陈列页', () => {
  it('不让搜索引擎收录', async () => {
    const html = await container.renderToString(PartsPage);

    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it('公共部件表里的每一项都摆出来了', async () => {
    const html = await container.renderToString(PartsPage);

    for (const part of [
      'site-header plain',
      'site-header pill',
      'sound-dot',
      'scroll-hint',
      'menu-button',
      'counter-block',
      'section-label',
      'example-tag text',
      'example-tag outline',
      'status-tag ok',
      'status-tag wait',
      'status-tag unknown',
      'choice-group',
      'field-control',
      'submit-button',
    ]) {
      expect(html, part).toContain(part);
    }
  });

  it('设计规范的每个变量都列出来了', async () => {
    const html = await container.renderToString(PartsPage);

    for (const name of [
      '--ink',
      '--status-ok-bg',
      '--display-ending',
      '--z-header',
    ]) {
      expect(html).toContain(`>${name}</code>`);
    }
  });
});
