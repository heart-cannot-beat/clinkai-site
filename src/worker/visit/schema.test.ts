import { describe, expect, it } from 'vitest';
import {
  cleanCountry,
  cleanPath,
  cleanReferrer,
  deviceClass,
  isBot,
  MAX_REFERRER_LENGTH,
  MAX_VISIT_PATH_LENGTH,
  VISIT_DATASET,
  VISIT_FIELDS,
  visitQueries,
} from './schema';

// 真实浏览器的 User-Agent 样子（不含任何个人信息）
const UA = {
  iphoneWechat:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.54 NetType/WIFI Language/zh_CN',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 15; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

describe('一条访问记录里有什么', () => {
  it('就四项：页面路径、来源、国家或地区、设备', () => {
    expect([...VISIT_FIELDS]).toEqual([
      'path',
      'referrer',
      'country',
      'device',
    ]);
  });
});

describe('页面路径', () => {
  it.each(['/', '/contact/', '/privacy/', '/404/', '/a/b_c-d/'])(
    '%s 收',
    (path) => {
      expect(cleanPath(path)).toBe(path);
    },
  );

  it.each([
    ['不以斜杠开头', 'contact/'],
    ['带查询串', '/contact/?from=wechat'],
    ['带锚点', '/contact/#form'],
    ['带完整地址', 'https://clinkai.example/contact/'],
    ['带空格', '/a b/'],
    ['带中文', '/关于/'],
    ['带点（文件名、上一级目录）', '/../secret.txt'],
    ['空的', ''],
  ])('%s：不收', (_, path) => {
    expect(cleanPath(path)).toBeNull();
  });

  it('不是字符串的不收', () => {
    for (const value of [undefined, null, 42, ['/'], { path: '/' }]) {
      expect(cleanPath(value)).toBeNull();
    }
  });

  it('超过 96 个字符的不收（数据集索引的上限）', () => {
    expect(MAX_VISIT_PATH_LENGTH).toBe(96);
    expect(cleanPath(`/${'a'.repeat(95)}`)).not.toBeNull();
    expect(cleanPath(`/${'a'.repeat(96)}`)).toBeNull();
  });
});

describe('来源只留域名', () => {
  const OWN = 'clinkai.example';

  it('域名原样留下，统一成小写', () => {
    expect(cleanReferrer('www.search.example', OWN)).toBe('www.search.example');
    expect(cleanReferrer('News.Example', OWN)).toBe('news.example');
    expect(cleanReferrer('xn--fiq228c.example', OWN)).toBe(
      'xn--fiq228c.example',
    );
  });

  it('站内跳转不算来源', () => {
    expect(cleanReferrer('clinkai.example', OWN)).toBe('');
    expect(cleanReferrer('CLINKAI.example', OWN)).toBe('');
  });

  it.each([
    ['完整地址', 'https://www.search.example/results?q=secret'],
    ['带路径', 'www.search.example/results'],
    ['带端口', 'www.search.example:8080'],
    ['带查询串', 'www.search.example?q=secret'],
    ['带空格', 'search example'],
    ['空的', ''],
  ])('%s：当成没有来源', (_, value) => {
    expect(cleanReferrer(value, OWN)).toBe('');
  });

  it('太长的、不是字符串的：当成没有来源', () => {
    expect(
      cleanReferrer(`${'a'.repeat(MAX_REFERRER_LENGTH)}.example`, OWN),
    ).toBe('');
    for (const value of [undefined, null, 42, ['a.example']]) {
      expect(cleanReferrer(value, OWN)).toBe('');
    }
  });
});

describe('国家或地区', () => {
  it('两位代码原样留下', () => {
    expect(cleanCountry('CN')).toBe('CN');
    expect(cleanCountry('US')).toBe('US');
    expect(cleanCountry('T1')).toBe('T1');
  });

  it('别的一律当成不知道', () => {
    for (const value of [undefined, null, '', 'cn', 'CHN', 'C', 86]) {
      expect(cleanCountry(value)).toBe('');
    }
  });
});

describe('手机还是电脑', () => {
  it('手机浏览器和微信里打开：手机', () => {
    expect(deviceClass(UA.iphoneWechat)).toBe('mobile');
    expect(deviceClass(UA.androidChrome)).toBe('mobile');
  });

  it('电脑浏览器、安卓平板、认不出的：电脑', () => {
    expect(deviceClass(UA.macSafari)).toBe('desktop');
    expect(deviceClass(UA.windowsChrome)).toBe('desktop');
    expect(deviceClass(UA.androidTablet)).toBe('desktop');
    expect(deviceClass(null)).toBe('desktop');
  });
});

describe('爬虫不算访问', () => {
  it.each([
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; moto g power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
    'Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)',
  ])('%s', (userAgent) => {
    expect(isBot(userAgent)).toBe(true);
  });

  it('没有 User-Agent 的也不算', () => {
    expect(isBot(null)).toBe(true);
    expect(isBot('')).toBe(true);
  });

  it('正常的浏览器（包括微信里的）算访问', () => {
    for (const userAgent of Object.values(UA)) {
      expect(isBot(userAgent), userAgent).toBe(false);
    }
  });
});

describe('查数据的 SQL', () => {
  const queries = visitQueries(7);

  it('五张表：每天、页面、来源、国家或地区、设备', () => {
    expect(queries.map((query) => query.column)).toEqual([
      'day',
      'path',
      'referrer',
      'country',
      'device',
    ]);
  });

  it('都查同一个数据集、同一段时间，条数用 SUM(_sample_interval) 算', () => {
    for (const { sql } of queries) {
      expect(sql).toContain(`FROM ${VISIT_DATASET} `);
      expect(sql).toContain("WHERE timestamp > NOW() - INTERVAL '7' DAY");
      expect(sql).toContain('SUM(_sample_interval) AS views');
      expect(sql).toMatch(/ LIMIT 100$/);
    }
  });

  it('每一项查的是它在记录里的那一列', () => {
    const sqlFor = (column: string) =>
      queries.find((query) => query.column === column)!.sql;

    expect(sqlFor('path')).toContain('SELECT blob1 AS path,');
    expect(sqlFor('referrer')).toContain('SELECT blob2 AS referrer,');
    expect(sqlFor('country')).toContain('SELECT blob3 AS country,');
    expect(sqlFor('device')).toContain('SELECT blob4 AS device,');
    expect(sqlFor('day')).toBe(
      `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, SUM(_sample_interval) AS views FROM ${VISIT_DATASET} WHERE timestamp > NOW() - INTERVAL '7' DAY GROUP BY day ORDER BY day LIMIT 100`,
    );
  });

  it('天数换了，时间段跟着换', () => {
    expect(visitQueries(30)[0]!.sql).toContain("INTERVAL '30' DAY GROUP BY");
  });

  it('天数只收 1 到 90 的整数：不会把别的东西拼进 SQL', () => {
    for (const days of [0, -1, 91, 1.5, Number.NaN]) {
      expect(() => visitQueries(days)).toThrow();
    }
    expect(() =>
      visitQueries("7' DAY; DROP TABLE x --" as unknown as number),
    ).toThrow();
  });
});
