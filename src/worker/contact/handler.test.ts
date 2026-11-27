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
import {
  CONTACT_FIELDS,
  TURNSTILE_FIELD,
  type FieldKind,
  type FieldSpec,
} from './schema';
import { SITEVERIFY_URL } from './turnstile';

const IP = '203.0.113.7';
const TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
const URL_ = `https://clinkai.example${CONTACT_PATH}`;

// 按字段类型生成一份能通过校验的示例数据。字段按交接包对齐后这里不用改。
function sampleValue(field: FieldSpec): string {
  const samples: Record<FieldKind, string> = {
    text: `示例 ${field.name}`,
    email: `${field.name}@pebblesound.example`,
    multiline: `示例 ${field.name}\n第二行`,
  };
  return samples[field.kind];
}

function validFields(): Record<string, string> {
  return Object.fromEntries(
    CONTACT_FIELDS.map((field) => [field.name, sampleValue(field)]),
  );
}

function validBody(): Record<string, string> {
  return { ...validFields(), [TURNSTILE_FIELD]: TOKEN };
}

function jsonRequest(body: unknown, init: RequestInit = {}): Request {
  return new Request(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': IP },
    body: JSON.stringify(body),
    ...init,
  });
}

function siteverifyReply(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }));
}

// 主机名在 TEST_CONFIG.TURNSTILE_HOSTNAMES 的白名单里
const PASS = { success: true, 'error-codes': [], hostname: 'clinkai.example' };

let fetchMock: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchMock = siteverifyReply(PASS);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function expectError(response: Response, status: number, error: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ ok: false, error });
}

describe('POST /api/contact 成功', () => {
  it('JSON 请求：校验、防刷、发信都过，返回 200', async () => {
    const { env, send, limit } = createFakeEnv();

    const response = await handleContact(jsonRequest(validBody()), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');

    expect(limit).toHaveBeenCalledWith({ key: `contact:${IP}` });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(SITEVERIFY_URL);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      secret: TEST_CONFIG.TURNSTILE_SECRET_KEY,
      response: TOKEN,
      remoteip: IP,
    });

    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]![0];
    expect(message.to).toBe(TEST_CONFIG.CONTACT_TO);
    expect(message.from).toBe(TEST_CONFIG.CONTACT_FROM);
    expect(message.subject).toBe(EMAIL_SUBJECT);
    expect(message.html).toBeUndefined();
    for (const [name, value] of Object.entries(validFields())) {
      expect(message.text).toContain(`${name}:\n${value}`);
    }
    expect(message.text).not.toContain(TOKEN);
  });

  it('回复地址用表单里的邮箱字段', async () => {
    const { env, send } = createFakeEnv();
    const replyField = CONTACT_FIELDS.find((field: FieldSpec) => field.replyTo);

    await handleContact(jsonRequest(validBody()), env);

    expect(send.mock.calls[0]![0].replyTo).toBe(
      replyField ? validFields()[replyField.name] : undefined,
    );
  });

  it('表单编码（urlencoded）也能收', async () => {
    const { env, send } = createFakeEnv();
    const request = new Request(URL_, {
      method: 'POST',
      headers: { 'cf-connecting-ip': IP },
      body: new URLSearchParams(validBody()),
    });

    const response = await handleContact(request, env);

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('multipart 表单也能收', async () => {
    const { env, send } = createFakeEnv();
    const form = new FormData();
    for (const [name, value] of Object.entries(validBody()))
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
  });

  it('浏览器发的大小写混合 multipart boundary 也能收', async () => {
    // Chrome / Safari 的 boundary 形如 ----WebKitFormBoundaryAbCdEf，大小写敏感
    const { env, send } = createFakeEnv();
    const boundary = '----WebKitFormBoundaryAbCdEfGh12';
    const body =
      Object.entries(validBody())
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
  it('返回 422 和每个出错字段的错误码，不调 Turnstile、不发信', async () => {
    const { env, send } = createFakeEnv();
    const required = CONTACT_FIELDS.filter(
      (field: FieldSpec) => field.required,
    );
    const body: Record<string, string> = validBody();
    for (const field of required) delete body[field.name];

    const response = await handleContact(jsonRequest(body), env);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'validation_failed',
      fields: Object.fromEntries(
        required.map((field) => [field.name, 'required']),
      ),
    });
    expect(fetchMock).not.toHaveBeenCalled();
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

describe('POST /api/contact 防刷失败', () => {
  it('没带 Turnstile token 时返回 403，不调 siteverify', async () => {
    const { env, send } = createFakeEnv();
    const body: Record<string, string> = validBody();
    delete body[TURNSTILE_FIELD];

    await expectError(
      await handleContact(jsonRequest(body), env),
      403,
      'turnstile_failed',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('token 超过 2048 个字符时返回 403，不调 siteverify', async () => {
    const { env } = createFakeEnv();
    const body = { ...validBody(), [TURNSTILE_FIELD]: 'x'.repeat(2049) };

    await expectError(
      await handleContact(jsonRequest(body), env),
      403,
      'turnstile_failed',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['invalid-input-response', 'timeout-or-duplicate', 'bad-request'])(
    'siteverify 判定失败（%s）时返回 403，不发信',
    async (code) => {
      vi.stubGlobal(
        'fetch',
        siteverifyReply({ success: false, 'error-codes': [code] }),
      );
      const { env, send } = createFakeEnv();

      await expectError(
        await handleContact(jsonRequest(validBody()), env),
        403,
        'turnstile_failed',
      );
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('siteverify 连不上时返回 503，不发信', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );
    const { env, send } = createFakeEnv();

    await expectError(
      await handleContact(jsonRequest(validBody()), env),
      503,
      'turnstile_unavailable',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ['HTTP 500', siteverifyReply({}, 500)],
    [
      'internal-error',
      siteverifyReply({ success: false, 'error-codes': ['internal-error'] }),
    ],
  ])('siteverify 自己出错（%s）时返回 503', async (_label, reply) => {
    vi.stubGlobal('fetch', reply);
    const { env } = createFakeEnv();

    await expectError(
      await handleContact(jsonRequest(validBody()), env),
      503,
      'turnstile_unavailable',
    );
  });

  it('Turnstile 密钥配错时返回 500', async () => {
    vi.stubGlobal(
      'fetch',
      siteverifyReply({
        success: false,
        'error-codes': ['invalid-input-secret'],
      }),
    );
    const { env, send } = createFakeEnv();

    await expectError(
      await handleContact(jsonRequest(validBody()), env),
      500,
      'server_error',
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe('POST /api/contact Turnstile 主机名白名单', () => {
  it.each([
    ['不在白名单里的主机名', { ...PASS, hostname: 'evil.example' }],
    ['白名单里主机名的子域名', { ...PASS, hostname: 'x.clinkai.example' }],
    ['没有 hostname 字段', { success: true, 'error-codes': [] }],
  ])('siteverify 通过但%s时返回 403，不发信', async (_label, reply) => {
    vi.stubGlobal('fetch', siteverifyReply(reply));
    const { env, send } = createFakeEnv();

    await expectError(
      await handleContact(jsonRequest(validBody()), env),
      403,
      'turnstile_failed',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('白名单里的任意一个主机名都通过，不分大小写、忽略空白', async () => {
    vi.stubGlobal(
      'fetch',
      siteverifyReply({ ...PASS, hostname: 'Preview.Clinkai.Example' }),
    );
    const { env, send } = createFakeEnv({
      TURNSTILE_HOSTNAMES: ' clinkai.example ,  PREVIEW.clinkai.example ',
    });

    const response = await handleContact(jsonRequest(validBody()), env);

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(['', '  ', ' , ,'])(
    '白名单为空（%j）时当作缺配置：返回 500，不调 siteverify、不发信',
    async (value) => {
      const { env, send, limit } = createFakeEnv({
        TURNSTILE_HOSTNAMES: value,
      });

      await expectError(
        await handleContact(jsonRequest(validBody()), env),
        500,
        'server_error',
      );
      expect(limit).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );
});

describe('POST /api/contact 限流', () => {
  it('超过阈值时返回 429 和 Retry-After，不读请求体、不调 Turnstile、不发信', async () => {
    const { env, send, limit } = createFakeEnv();
    limit.mockResolvedValue({ success: false });

    const response = await handleContact(jsonRequest(validBody()), env);

    await expectError(response, 429, 'rate_limited');
    expect(response.headers.get('retry-after')).toBe('60');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('限流绑定本身出错时放行，靠 Turnstile 兜底', async () => {
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

  it.each([
    'TURNSTILE_SECRET_KEY',
    'TURNSTILE_HOSTNAMES',
    'CONTACT_TO',
    'CONTACT_FROM',
  ] as const)('缺少 %s 配置时返回 500，不发信', async (name) => {
    const { env, send } = createFakeEnv({ [name]: undefined });

    await expectError(
      await handleContact(jsonRequest(validBody()), env),
      500,
      'server_error',
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe('日志', () => {
  it('任何结果下都不记录表单内容、联系方式、token 和 IP', async () => {
    const logged: unknown[][] = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
    }

    const scenarios: Array<() => Promise<unknown>> = [
      // 成功
      () => handleContact(jsonRequest(validBody()), createFakeEnv().env),
      // 校验失败
      () => {
        const body: Record<string, string> = validBody();
        const required = CONTACT_FIELDS.find(
          (field: FieldSpec) => field.required,
        );
        if (required) delete body[required.name];
        return handleContact(jsonRequest(body), createFakeEnv().env);
      },
      // 防刷失败
      () => {
        vi.stubGlobal(
          'fetch',
          siteverifyReply({
            success: false,
            'error-codes': ['timeout-or-duplicate'],
          }),
        );
        return handleContact(jsonRequest(validBody()), createFakeEnv().env);
      },
      // 发送失败：错误信息里带了收件人，也不能进日志
      () => {
        vi.stubGlobal('fetch', siteverifyReply(PASS));
        const fake = createFakeEnv();
        const address = Object.values(validFields()).find((value) =>
          value.includes('@'),
        );
        fake.send.mockRejectedValue(
          Object.assign(new Error(`cannot deliver to ${address}`), {
            code: 'E_DELIVERY_FAILED',
          }),
        );
        return handleContact(jsonRequest(validBody()), fake.env);
      },
    ];
    for (const run of scenarios) await run();

    expect(logged.length).toBeGreaterThan(0);
    const output = logged
      .map((args) => args.map((arg) => String(arg)).join(' '))
      .join('\n');
    const secrets = [
      ...Object.values(validFields()),
      TOKEN,
      IP,
      TEST_CONFIG.TURNSTILE_SECRET_KEY,
    ];
    for (const value of secrets) {
      for (const line of value.split('\n')) expect(output).not.toContain(line);
    }
  });
});
