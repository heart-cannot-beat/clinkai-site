// 把提交逻辑（submit.ts）接到页面的表单上：提交中禁用按钮、按字段标错、显示提示语。
// 页面这边的约定（src/components/contact/ContactForm.astro 和 src/components/form/）：
// - <form data-contact-form data-fields="字段表 JSON" data-copy="提示语 JSON" data-state="…">
// - 每个字段外面一层 [data-field="名字"]，里面有 [data-error-for="名字"] 放错误提示
// - [data-contact-status] 放提交结果的提示语（role="status"，读屏会播报）
// 提示语是 null 的（交接包里还没有，见 src/data/contact.ts）就不显示文字，状态照常切换。

import type { ContactCopy } from '../data/contact';
import type { FieldError, FieldSpec } from '../worker/contact/schema';
import { buildPayload, createSubmitter, type SubmitOutcome } from './submit';

export type FormState =
  'idle' | 'submitting' | 'success' | 'invalid' | 'rate_limited' | 'failed';

export interface ContactFormOptions {
  /** 测试里换成假的；默认用浏览器的 fetch */
  fetch?: typeof fetch;
}

function readJson<T>(raw: string | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function initContactForm(
  form: HTMLFormElement,
  options: ContactFormOptions = {},
): void {
  const fields = readJson<FieldSpec[]>(form.dataset.fields, []);
  const copy = readJson<Partial<ContactCopy>>(form.dataset.copy, {});
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const status = form.querySelector<HTMLElement>('[data-contact-status]');
  const submitter = createSubmitter({
    endpoint: form.getAttribute('action') ?? '',
    fields,
    fetch: options.fetch,
  });

  const controls = (name: string) =>
    form.querySelectorAll<HTMLElement>(`[name="${name}"]`);

  function setState(state: FormState) {
    form.dataset.state = state;
    const busy = state === 'submitting';
    if (busy) form.setAttribute('aria-busy', 'true');
    else form.removeAttribute('aria-busy');
    // 提交成功后按钮一直禁用，免得同一份内容发两次
    if (button) button.disabled = busy || state === 'success';
  }

  function setStatus(message: string | null | undefined) {
    if (status) status.textContent = message ?? '';
  }

  function setFieldError(name: string, code: FieldError | null) {
    const wrapper = form.querySelector(`[data-field="${name}"]`);
    const error = form.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
    const message = code ? (copy.fieldErrors?.[code] ?? '') : '';

    wrapper?.toggleAttribute('data-invalid', code !== null);
    for (const control of controls(name)) {
      if (code) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    }
    if (error) {
      error.textContent = message;
      error.hidden = message === '';
    }
  }

  function show(outcome: SubmitOutcome) {
    switch (outcome.kind) {
      case 'success':
        setState('success');
        setStatus(copy.success);
        return;
      case 'invalid': {
        const names = fields
          .map((field) => field.name)
          .filter((name) => outcome.fields[name] !== undefined);
        for (const name of names) setFieldError(name, outcome.fields[name]!);
        setState('invalid');
        setStatus(copy.invalid);
        if (names[0]) controls(names[0])[0]?.focus();
        return;
      }
      case 'rate_limited':
        setState('rate_limited');
        setStatus(copy.rateLimited);
        return;
      case 'failed':
        setState('failed');
        setStatus(copy.failed);
        return;
    }
  }

  form.addEventListener('submit', (event) => {
    // 脚本接管提交，不让浏览器整页跳到接口地址
    event.preventDefault();
    void (async () => {
      const state = form.dataset.state;
      // 上一次还没回来：什么都不做，按钮本来就是禁用的
      if (state === 'submitting') return;
      // 已经提交成功过：不再发请求，只换提示语
      if (state === 'success') {
        if (copy.duplicate) setStatus(copy.duplicate);
        return;
      }

      for (const field of fields) setFieldError(field.name, null);
      setStatus(null);
      setState('submitting');
      const outcome = await submitter.submit(
        buildPayload(new FormData(form), fields),
      );
      if (outcome.kind !== 'duplicate') show(outcome);
    })();
  });

  // 改了出错的字段，就把那个字段的标记去掉
  form.addEventListener('input', (event) => {
    const name = (event.target as { name?: unknown } | null)?.name;
    if (typeof name === 'string' && name !== '') setFieldError(name, null);
  });
}
