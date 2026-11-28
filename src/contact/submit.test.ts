import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FieldSpec } from '../worker/contact/schema';
import { buildPayload, createSubmitter, SUBMIT_TIMEOUT_MS } from './submit';

// 提交逻辑的测试用自己的字段表，表单字段改了这里不用跟着改
const FIELDS = [
  { name: 'brand', kind: 'text', required: true, maxLength: 30 },
  {
    name: 'market',
    kind: 'choices',
    required: true,
    options: ['北美', '欧洲', '中东'],
  },
  { name: 'note', kind: 'multiline', required: false, maxLength: 20 },
] as const satisfies readonly FieldSpec[];

const ENDPOINT = 'https://clinkai.example/api/contact';
const VALID = { brand: ' Pebblesound（示例） ', market: ['欧洲', '北美'] };

function reply(status: number, body?: unknown) {
  return vi.fn<typeof fetch>(async () =>
    body === undefined
      ? new Response('<html>不是 JSON</html>', { status })
      : Response.json(body, { status }),
  );
}

function submitterWith(fetchMock: typeof fetch) {
  return createSubmitter({
    endpoint: ENDPOINT,
    fields: FIELDS,
    fetch: fetchMock,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('buildPayload：从表单数据里取出字段表里的值', () => {
  it('单行和多行字段取字符串，多选取全部勾选的值，别的键丢掉', () => {
    const form = new FormData();
    form.append('brand', 'Pebblesound（示例）');
    form.append('market', '北美');
    form.append('market', '欧洲');
    form.append('note', '第一行\n第二行');
    form.append('extra', '不要');

    expect(buildPayload(form, FIELDS)).toEqual({
      brand: 'Pebblesound（示例）',
      market: ['北美', '欧洲'],
      note: '第一行\n第二行',
    });
  });

  it('多选一个都没勾时是空数组，没有的单行字段是空字符串', () => {
    expect(buildPayload(new FormData(), FIELDS)).toEqual({
      brand: '',
      market: [],
      note: '',
    });
  });
});

describe('提交成功', () => {
  it('把校验过的值用 JSON 发给接口，接口回 200 时结果是 success', async () => {
    const fetchMock = reply(200, { ok: true });

    const outcome = await submitterWith(fetchMock).submit(VALID);

    expect(outcome).toEqual({ kind: 'success' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(ENDPOINT);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('content-type')).toBe(
      'application/json',
    );
    // 去掉首尾空白，多选按选项表的顺序
    expect(JSON.parse(String(init?.body))).toEqual({
      brand: 'Pebblesound（示例）',
      market: ['北美', '欧洲'],
    });
  });
});

describe('校验失败', () => {
  it('发请求之前先用和接口同一份规则校验，不过就按字段报错，不发请求', async () => {
    const fetchMock = reply(200, { ok: true });

    const outcome = await submitterWith(fetchMock).submit({
      brand: '  ',
      market: [],
      note: '字'.repeat(21),
    });

    expect(outcome).toEqual({
      kind: 'invalid',
      fields: { brand: 'required', market: 'required', note: 'too_long' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('接口回 422 时按接口给的字段和错误码报错', async () => {
    const fetchMock = reply(422, {
      ok: false,
      error: 'validation_failed',
      fields: { brand: 'too_long', market: 'invalid' },
    });

    const outcome = await submitterWith(fetchMock).submit(VALID);

    expect(outcome).toEqual({
      kind: 'invalid',
      fields: { brand: 'too_long', market: 'invalid' },
    });
  });

  it('接口回的 422 里只认字段表里的字段和三种错误码', async () => {
    const fetchMock = reply(422, {
      ok: false,
      error: 'validation_failed',
      fields: { brand: 'required', unknown: 'required', note: '<b>乱写</b>' },
    });

    const outcome = await submitterWith(fetchMock).submit(VALID);

    expect(outcome).toEqual({ kind: 'invalid', fields: { brand: 'required' } });
  });

  it('校验失败后改了再提交，照常发请求', async () => {
    const fetchMock = reply(200, { ok: true });
    const submitter = submitterWith(fetchMock);

    await submitter.submit({ brand: '', market: [] });
    const outcome = await submitter.submit(VALID);

    expect(outcome).toEqual({ kind: 'success' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('限流', () => {
  it('接口回 429 时结果是 rate_limited，之后还能再提交', async () => {
    const fetchMock = reply(429, { ok: false, error: 'rate_limited' });
    const submitter = submitterWith(fetchMock);

    expect(await submitter.submit(VALID)).toEqual({ kind: 'rate_limited' });
    expect(await submitter.submit(VALID)).toEqual({ kind: 'rate_limited' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('发送失败', () => {
  it.each([
    ['发信失败 502', reply(502, { ok: false, error: 'send_failed' })],
    ['服务端配置缺失 500', reply(500, { ok: false, error: 'server_error' })],
    ['请求体格式不对 400', reply(400, { ok: false, error: 'bad_request' })],
    ['回的不是 JSON（比如静态站的 404 页）', reply(404)],
    ['状态码 200 但内容不是 ok:true', reply(200, { ok: false })],
    ['状态码 200 但不是 JSON', reply(200)],
    ['422 但没有可用的字段错误', reply(422, { ok: false, fields: {} })],
  ])('%s：结果是 failed', async (_label, fetchMock) => {
    expect(await submitterWith(fetchMock).submit(VALID)).toEqual({
      kind: 'failed',
    });
  });

  it('网络不通时结果是 failed，之后还能再提交', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const submitter = submitterWith(fetchMock);

    expect(await submitter.submit(VALID)).toEqual({ kind: 'failed' });
    expect(await submitter.submit(VALID)).toEqual({ kind: 'success' });
  });

  it('接口一直不回时，到时间就取消请求，结果是 failed', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );

    const pending = submitterWith(fetchMock).submit(VALID);
    await vi.advanceTimersByTimeAsync(SUBMIT_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(signal?.aborted).toBe(true);
    expect(await pending).toEqual({ kind: 'failed' });
  });
});

describe('重复提交', () => {
  it('上一次还没回来时再提交，不发第二个请求', async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>(
      () => new Promise<Response>((resolve) => (finish = resolve)),
    );
    const submitter = submitterWith(fetchMock);

    const first = submitter.submit(VALID);
    const second = await submitter.submit(VALID);
    finish(Response.json({ ok: true }));

    expect(second).toEqual({ kind: 'duplicate', of: 'submitting' });
    expect(await first).toEqual({ kind: 'success' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('提交成功以后再提交，不发第二个请求', async () => {
    const fetchMock = reply(200, { ok: true });
    const submitter = submitterWith(fetchMock);

    await submitter.submit(VALID);
    const again = await submitter.submit(VALID);

    expect(again).toEqual({ kind: 'duplicate', of: 'success' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
