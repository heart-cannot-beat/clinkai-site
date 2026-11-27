import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { createFakeEnv, TEST_CONFIG } from '../fake-env';
import {
  CONTACT_PATH,
  EMAIL_SUBJECT,
  handleContact,
  MAX_BODY_BYTES,
} from './handler';
import { CONTACT_FIELDS, type FieldSpec, type FieldValue } from './schema';

const IP = '203.0.113.7';
const URL_ = `https://clinkai.example${CONTACT_PATH}`;

// 按字段类型生成一份能通过校验的示例数据。字段表改了这里不用跟着改。
function sampleValue(field: FieldSpec): FieldValue {
  switch (field.kind) {
    case 'text':
      return `示例 ${field.name}`;
    case 'email':
      return `${field.name}@pebblesound.example`;
    case 'multiline':
      return `示例 ${field.name}\n第二行`;
    case 'choices':
      return field.options.slice(0, 2);
    case 'choice':
      return field.options[0]!;
  }
}

function validBody(): Record<string, FieldValue> {
  return Object.fromEntries(
    CONTACT_FIELDS.map((field) => [field.name, sampleValue(field)]),
  );
}

/** 表单编码：多选的每个值各占一个同名的键 */
function formEntries(body: Record<string, FieldValue>): [string, string][] {
  return Object.entries(body).flatMap(([name, value]) =>
    (Array.isArray(value) ? value : [value]).map((item): [string, string] => [
      name,
      item,
    ]),
  );
}

/** 邮件正文里一个字段的样子：多选的值用顿号连起来 */
function emailBlock(name: string, value: FieldValue): string {
  return `${name}:\n${Array.isArray(value) ? value.join('、') : value}`;
}

function jsonRequest(body: unknown, init: RequestInit = {}): Request {
  return new Request(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': IP },
    body: JSON.stringify(body),
    ...init,
  });
}

// 接口不该访问任何外部服务（Turnstile 已经拿掉）：谁调了 fetch，测试就失败
let fetchMock: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>(async () => {
    throw new Error('接口不应该发起任何外部请求');
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function expectError(response: Response, status: number, error: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ ok: false, error });
}

describe('POST /api/contact 成功', () => {
  it('JSON 请求：校验通过就发信，返回 200；不需要 Turnstile token', async () => {
    const { env, send, limit } = createFakeEnv();

    const response = await handleContact(jsonRequest(validBody()), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');

    expect(limit).toHaveBeenCalledWith({ key: `contact:${IP}` });

    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]![0];
    expect(message.to).toBe(TEST_CONFIG.CONTACT_TO);
    expect(message.from).toBe(TEST_CONFIG.CONTACT_FROM);
    expect(message.subject).toBe(EMAIL_SUBJECT);
    expect(message.html).toBeUndefined();
    for (const [name, value] of Object.entries(validBody())) {
      expect(message.text).toContain(emailBlock(name, value));
    }
  });

  it('只需要收发件地址两个配置：env 里没有任何 Turnstile 配置也能发', async () => {
    const { env, send } = createFakeEnv();

    expect(Object.keys(env).filter((key) => /turnstile/i.test(key))).toEqual(
      [],
    );
    const response = await handleContact(jsonRequest(validBody()), env);

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('多选的值在邮件里按选项表的顺序用顿号连起来', async () => {
    const { env, send } = createFakeEnv();
    const body = { ...validBody(), market: ['日韩', '北美'] };

    await handleContact(jsonRequest(body), env);

    expect(send.mock.calls[0]![0].text).toContain('market:\n北美、日韩');
  });

  it('字段表里没有的键直接丢掉，不进邮件（比如旧页面还在发的 Turnstile token）', async () => {
    const { env, send } = createFakeEnv();
    const body = {
      ...validBody(),
      'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX',
      extra: '多出来的',
    };

    const response = await handleContact(jsonRequest(body), env);

    expect(response.status).toBe(200);
    const text = send.mock.calls[0]![0].text;
    expect(text).not.toContain('DUMMY');
    expect(text).not.toContain('多出来的');
  });

  it('回复地址用表单里的邮箱字段；字段表里没有邮箱字段时不设回复地址', async () => {
    const { env, send } = createFakeEnv();
    const replyField = CONTACT_FIELDS.find(
      (field: FieldSpec) => 'replyTo' in field && field.replyTo,
    );

    await handleContact(jsonRequest(validBody()), env);

    expect(send.mock.calls[0]![0].replyTo).toBe(
      replyField ? validBody()[replyField.name] : undefined,
    );
  });

  it('表单编码（urlencoded）也能收，多选是重复的同名键', async () => {
    const { env, send } = createFakeEnv();
    const request = new Request(URL_, {
      method: 'POST',
      headers: { 'cf-connecting-ip': IP },
      body: new URLSearchParams(formEntries(validBody())),
    });

    const response = await handleContact(request, env);

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    for (const [name, value] of Object.entries(validBody())) {
      expect(send.mock.calls[0]![0].text).toContain(emailBlock(name, value));
    }
  });

  it('multipart 表单也能收，多选是重复的同名键', async () => {
    const { env, send } = createFakeEnv();
    const form = new FormData();
    for (const [name, value] of formEntries(validBody()))
      form.append(name, value);

    const response = await handleContact(
      new Request(URL_, {
        method: 'POST',
        headers: { 'cf-connecting-ip': IP },
        body: form,
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    for (const [name, value] of Object.entries(validBody())) {
      expect(send.mock.calls[0]![0].text).toContain(emailBlock(name, value));
    }
  });

  it('浏览器发的大小写混合 multipart boundary 也能收', async () => {
    // Chrome / Safari 的 boundary 形如 ----WebKitFormBoundaryAbCdEf，大小写敏感
    const { env, send } = createFakeEnv();
    const boundary = '----WebKitFormBoundaryAbCdEfGh12';
    const body =
      formEntries(validBody())
        .map(
          ([name, value]) =>
            `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        )
        .join('') + `--${boundary}--\r\n`;

    const response = await handleContact(
      new Request(URL_, {
        method: 'POST',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
          'cf-connecting-ip': IP,
        },
        body,
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/contact 校验失败', () => {
  it('返回 422 和每个出错字段的错误码，不发信', async () => {
    const { env, send } = createFakeEnv();
    const required = CONTACT_FIELDS.filter(
      (field: FieldSpec) => field.required,
    );
    const body = validBody();
    for (const field of required) delete body[field.name];

    const response = await handleContact(jsonRequest(body), env);

    expect(required.length).toBeGreaterThan(0);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'validation_failed',
      fields: Object.fromEntries(
        required.map((field) => [field.name, 'required']),
      ),
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('多选里有选项表之外的值时，那个字段报 invalid', async () => {
    const { env, send } = createFakeEnv();
    const body = { ...validBody(), service: ['广告', '不在表里'] };

    const response = await handleContact(jsonRequest(body), env);

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      fields: { service: 'invalid' },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('表单编码下单行字段出现重复的键时，那个字段报 invalid', async () => {
    const { env, send } = createFakeEnv();
    const request = new Request(URL_, {
      method: 'POST',
      body: new URLSearchParams([
        ...formEntries(validBody()),
        ['brand', '第二个品牌名'],
      ]),
    });

    const response = await handleContact(request, env);

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      fields: { brand: 'invalid' },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['不是合法 JSON', 'application/json', '{"name":'],
    ['JSON 不是对象', 'application/json', '["x"]'],
    ['不支持的类型', 'text/plain', 'hello'],
  ])('请求体%s时返回 400', async (_label, contentType, body) => {
    const { env, send } = createFakeEnv();
    const request = new Request(URL_, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    });

    await expectError(await handleContact(request, env), 400, 'bad_request');
    expect(send).not.toHaveBeenCalled();
  });

  it('请求体太大时返回 413', async () => {
    const { env, send } = createFakeEnv();
    const body = { ...validBody(), padding: 'x'.repeat(MAX_BODY_BYTES) };

    await expectError(
      await handleContact(jsonRequest(body), env),
      413,
      'payload_too_large',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('所有字段都填到上限也不超过请求体上限', () => {
    const full = Object.fromEntries(
      CONTACT_FIELDS.map((field) => [
        field.name,
        'options' in field ? field.options : '字'.repeat(field.maxLength),
      ]),
    );
    const bytes = new TextEncoder().encode(JSON.stringify(full)).byteLength;

    expect(bytes).toBeLessThan(MAX_BODY_BYTES);
  });

  it('没有 Content-Length 的流式请求体超过上限时立刻返回 413，不读完整个请求体', async () => {
    const { env, send } = createFakeEnv();
    const chunk = new TextEncoder().encode('x'.repeat(1024));
    let pulls = 0;
    let cancelled = false;
    // 一个永远不结束的流：要是先把整个请求体读进内存，这个测试会一直卡住
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    expect(request.headers.get('content-length')).toBeNull();

    await expectError(
      await handleContact(request, env),
      413,
      'payload_too_large',
    );
    expect(pulls).toBeLessThan(MAX_BODY_BYTES / chunk.byteLength + 5);
    expect(cancelled).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it('不是 POST 时返回 405 和 Allow 头', async () => {
    const { env, limit } = createFakeEnv();

    const response = await handleContact(new Request(URL_), env);

    await expectError(response, 405, 'method_not_allowed');
    expect(response.headers.get('allow')).toBe('POST');
    expect(limit).not.toHaveBeenCalled();
  });
});

describe('POST /api/contact 限流', () => {
  it('超过阈值时返回 429 和 Retry-After，不读请求体、不发信', async () => {
    const { env, send, limit } = createFakeEnv();
    limit.mockResolvedValue({ success: false });

    const response = await handleContact(jsonRequest(validBody()), env);

    await expectError(response, 429, 'rate_limited');
    expect(response.headers.get('retry-after')).toBe('60');
    expect(send).not.toHaveBeenCalled();
  });

  it('限流绑定本身出错时放行，不把真实用户全挡掉', async () => {
    const { env, send, limit } = createFakeEnv();
    limit.mockRejectedValue(new Error('binding unavailable'));

    const response = await handleContact(jsonRequest(validBody()), env);

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('没有 CF-Connecting-IP 时也按同一个键限流', async () => {
    const { env, limit } = createFakeEnv();

    await handleContact(
      jsonRequest(validBody(), {
        headers: { 'content-type': 'application/json' },
      }),
      env,
    );

    expect(limit).toHaveBeenCalledWith({ key: 'contact:unknown' });
  });
});

describe('POST /api/contact 发送失败', () => {
  it('发信绑定报错时返回 502', async () => {
    const { env, send } = createFakeEnv();
    send.mockRejectedValue(
      Object.assign(new Error('delivery failed'), {
        code: 'E_DELIVERY_FAILED',
      }),
    );

    await expectError(
      await handleContact(jsonRequest(validBody()), env),
      502,
      'send_failed',
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(['CONTACT_TO', 'CONTACT_FROM'] as const)(
    '缺少 %s 配置时返回 500，不限流计数、不发信',
    async (name) => {
      const { env, send, limit } = createFakeEnv({ [name]: undefined });

      await expectError(
        await handleContact(jsonRequest(validBody()), env),
        500,
        'server_error',
      );
      expect(limit).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );
});

describe('日志', () => {
  it('任何结果下都不记录表单内容、联系方式和 IP', async () => {
    const logged: unknown[][] = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    }
    // 每个字段都用别处不会出现的示例值，多选也算表单内容
    const body = validBody();
    const contact = 'lin@pebblesound.example';
    body.contact = contact;

    const scenarios: Array<() => Promise<unknown>> = [
      // 成功
      () => handleContact(jsonRequest(body), createFakeEnv().env),
      // 校验失败
      () => {
        const broken: Record<string, FieldValue> = {
          ...body,
          service: ['不在表里的服务'],
        };
        delete broken.brand;
        return handleContact(jsonRequest(broken), createFakeEnv().env);
      },
      // 限流
      () => {
        const fake = createFakeEnv();
        fake.limit.mockResolvedValue({ success: false });
        return handleContact(jsonRequest(body), fake.env);
      },
      // 发送失败：错误信息里带了联系方式，也不能进日志
      () => {
        const fake = createFakeEnv();
        fake.send.mockRejectedValue(
          Object.assign(new Error(`cannot deliver to ${contact}`), {
            code: 'E_DELIVERY_FAILED',
          }),
        );
        return handleContact(jsonRequest(body), fake.env);
      },
    ];
    for (const run of scenarios) await run();

    expect(logged).toHaveLength(scenarios.length);
    const output = logged
      .map((args) => args.map((arg) => String(arg)).join(' '))
      .join('\n');
    const secrets = [
      ...Object.values(body).flat(),
      '不在表里的服务',
      IP,
      TEST_CONFIG.CONTACT_TO,
      TEST_CONFIG.CONTACT_FROM,
    ];
    for (const value of secrets) {
      for (const line of value.split('\n')) expect(output).not.toContain(line);
    }
  });
});
