// 提交脚本接到页面上以后的行为。用真实的表单组件渲染出来的 HTML，接口是假的。
// 页面环境用 happy-dom 手动建：Astro 组件只能在 Node 环境里渲染，所以不用 Vitest 的 happy-dom 环境。
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { Window } from 'happy-dom';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import ContactForm from '../components/contact/ContactForm.astro';
import { CONTACT_COPY, type ContactCopy } from '../data/contact';
import { initContactForm } from './form';

// 只给测试用的提示语，不是站点文案（站点文案还没到，见 src/data/contact.ts）
const TEST_COPY: ContactCopy = {
  privacy: null,
  success: '〔测试〕成功',
  invalid: '〔测试〕有字段没填对',
  rateLimited: '〔测试〕限流',
  failed: '〔测试〕失败',
  duplicate: '〔测试〕已经提交过',
  fieldErrors: {
    required: '〔测试〕必填',
    too_long: '〔测试〕超长',
    invalid: '〔测试〕格式不对',
  },
};

let container: AstroContainer;
let window: Window;
let document: Document;
let form: HTMLFormElement;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeAll(async () => {
  container = await AstroContainer.create();
});

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
  window = new Window({ url: 'https://clinkai.example/contact/' });
  document = window.document as unknown as Document;
  // 提交脚本里的 new FormData(form) 要认得 happy-dom 的表单
  vi.stubGlobal('FormData', window.FormData);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await window.happyDOM.close();
});

async function mount(copy: ContactCopy = TEST_COPY) {
  document.body.innerHTML = await container.renderToString(ContactForm, {
    props: { copy },
  });
  form = document.querySelector<HTMLFormElement>('[data-contact-form]')!;
  initContactForm(form, { fetch: fetchMock });
}

const control = <T extends HTMLElement = HTMLInputElement>(name: string) =>
  form.querySelector<T>(`[name="${name}"]`)!;
const checkbox = (name: string, value: string) =>
  form.querySelector<HTMLInputElement>(`[name="${name}"][value="${value}"]`)!;
const button = () =>
  form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const status = () =>
  form.querySelector<HTMLElement>('[data-contact-status]')!.textContent;
const errorOf = (name: string) =>
  form.querySelector<HTMLElement>(`[data-error-for="${name}"]`)!;
const invalidFields = () =>
  [...form.querySelectorAll<HTMLElement>('[data-invalid]')].map(
    (element) => element.dataset.field,
  );

function fillValid() {
  control('brand').value = 'Pebblesound（示例）';
  control('site').value = 'https://pebblesound.example';
  checkbox('market', '北美').checked = true;
  checkbox('market', '日韩').checked = true;
  checkbox('service', '广告').checked = true;
  control('contact').value = '微信 pebblesound-example';
}

const domEvent = (type: string) =>
  new window.Event(type, {
    bubbles: true,
    cancelable: true,
  }) as unknown as Event;

function submit() {
  const event = domEvent('submit');
  form.dispatchEvent(event);
  return event;
}

const settled = (state: string) =>
  vi.waitFor(() => expect(form.dataset.state).toBe(state));

/** 一个由测试决定什么时候回的接口 */
function pendingReply() {
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation(
    () => new Promise<Response>((resolve) => (finish = resolve)),
  );
  return (response: Response) => finish(response);
}

describe('提交成功', () => {
  it('脚本接管提交：不让浏览器整页跳转，把表单内容用 JSON 发给接口', async () => {
    await mount();
    fillValid();

    const event = submit();
    await settled('success');

    expect(event.defaultPrevented).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/contact');
    expect(JSON.parse(String(init?.body))).toEqual({
      brand: 'Pebblesound（示例）',
      site: 'https://pebblesound.example',
      market: ['北美', '日韩'],
      service: ['广告'],
      contact: '微信 pebblesound-example',
    });
  });

  it('提交中按钮禁用；接口回来后显示成功的提示语', async () => {
    await mount();
    fillValid();
    const finish = pendingReply();

    submit();
    await settled('submitting');
    expect(button().disabled).toBe(true);
    expect(form.getAttribute('aria-busy')).toBe('true');
    expect(status()).toBe('');

    finish(Response.json({ ok: true }));
    await settled('success');
    expect(status()).toBe(TEST_COPY.success);
    expect(form.hasAttribute('aria-busy')).toBe(false);
  });
});

describe('重复提交', () => {
  it('提交中连点：只发一次请求', async () => {
    await mount();
    fillValid();
    const finish = pendingReply();

    submit();
    submit();
    submit();
    finish(Response.json({ ok: true }));
    await settled('success');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('提交成功后按钮一直禁用，填的内容留着', async () => {
    await mount();
    fillValid();

    submit();
    await settled('success');

    expect(button().disabled).toBe(true);
    expect(control('brand').value).toBe('Pebblesound（示例）');
  });

  it('提交成功后再提交一次：不发第二次请求，显示重复提交的提示语', async () => {
    await mount();
    fillValid();
    submit();
    await settled('success');

    submit();
    await vi.waitFor(() => expect(status()).toBe(TEST_COPY.duplicate));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(form.dataset.state).toBe('success');
    expect(button().disabled).toBe(true);
  });
});

describe('校验失败：按字段标错', () => {
  it('必填的没填：不发请求，每个出错的字段都标出来并显示提示语', async () => {
    await mount();

    submit();
    await settled('invalid');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(invalidFields()).toEqual([
      'brand',
      'site',
      'market',
      'service',
      'contact',
    ]);
    expect(control('brand').getAttribute('aria-invalid')).toBe('true');
    expect(checkbox('market', '欧洲').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(errorOf('brand').textContent).toBe(TEST_COPY.fieldErrors.required);
    expect(errorOf('brand').hidden).toBe(false);
    expect(errorOf('note').hidden).toBe(true);
    expect(status()).toBe(TEST_COPY.invalid);
  });

  it('标错后按钮可以再点，焦点落在第一个出错的控件上', async () => {
    await mount();
    control('brand').value = 'Pebblesound（示例）';

    submit();
    await settled('invalid');

    expect(button().disabled).toBe(false);
    expect(document.activeElement).toBe(control('site'));
  });

  it('接口回 422：按接口说的字段和错误码标', async () => {
    await mount();
    fillValid();
    fetchMock.mockResolvedValue(
      Response.json(
        {
          ok: false,
          error: 'validation_failed',
          fields: { site: 'invalid', note: 'too_long' },
        },
        { status: 422 },
      ),
    );

    submit();
    await settled('invalid');

    expect(invalidFields()).toEqual(['site', 'note']);
    expect(errorOf('site').textContent).toBe(TEST_COPY.fieldErrors.invalid);
    expect(errorOf('note').textContent).toBe(TEST_COPY.fieldErrors.too_long);
    expect(control('brand').hasAttribute('aria-invalid')).toBe(false);
  });

  it('改了出错的字段，那个字段的标记就去掉，别的还在', async () => {
    await mount();
    submit();
    await settled('invalid');

    control('brand').value = 'Pebblesound（示例）';
    control('brand').dispatchEvent(domEvent('input'));
    checkbox('market', '北美').checked = true;
    checkbox('market', '北美').dispatchEvent(domEvent('input'));

    expect(invalidFields()).toEqual(['site', 'service', 'contact']);
    expect(control('brand').hasAttribute('aria-invalid')).toBe(false);
    expect(checkbox('market', '欧洲').hasAttribute('aria-invalid')).toBe(false);
    expect(errorOf('brand').hidden).toBe(true);
    expect(errorOf('brand').textContent).toBe('');
  });

  it('改好再提交：上一次的标记和提示语都清掉', async () => {
    await mount();
    submit();
    await settled('invalid');

    fillValid();
    submit();
    await settled('success');

    expect(invalidFields()).toEqual([]);
    expect(form.querySelectorAll('[aria-invalid]')).toHaveLength(0);
    expect(status()).toBe(TEST_COPY.success);
  });
});

describe('限流', () => {
  it('接口回 429：显示限流的提示语，按钮可以再点', async () => {
    await mount();
    fillValid();
    fetchMock.mockResolvedValue(
      Response.json({ ok: false, error: 'rate_limited' }, { status: 429 }),
    );

    submit();
    await settled('rate_limited');

    expect(status()).toBe(TEST_COPY.rateLimited);
    expect(button().disabled).toBe(false);
  });
});

describe('发送失败', () => {
  it('接口回 502：显示失败的提示语，按钮可以再点，填的内容留着', async () => {
    await mount();
    fillValid();
    fetchMock.mockResolvedValue(
      Response.json({ ok: false, error: 'send_failed' }, { status: 502 }),
    );

    submit();
    await settled('failed');

    expect(status()).toBe(TEST_COPY.failed);
    expect(button().disabled).toBe(false);
    expect(control('brand').value).toBe('Pebblesound（示例）');
    expect(checkbox('market', '日韩').checked).toBe(true);
  });

  it('网络不通：也按失败处理；再点一次能重新提交', async () => {
    await mount();
    fillValid();
    fetchMock.mockRejectedValueOnce(new TypeError('network down'));

    submit();
    await settled('failed');
    submit();
    await settled('success');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(status()).toBe(TEST_COPY.success);
  });
});

describe('提示语还没到（现在线上的状态）', () => {
  it('提交照常工作，状态照常切换，只是不显示任何提示语', async () => {
    await mount(CONTACT_COPY);
    fillValid();

    submit();
    await settled('success');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(button().disabled).toBe(true);
    expect(status()).toBe('');
  });

  it('出错的字段照常标出来，提示语那一行继续藏着', async () => {
    await mount(CONTACT_COPY);

    submit();
    await settled('invalid');

    expect(invalidFields()).toContain('brand');
    expect(errorOf('brand').hidden).toBe(true);
    expect(errorOf('brand').textContent).toBe('');
    expect(status()).toBe('');
  });
});
