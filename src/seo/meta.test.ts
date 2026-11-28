import { describe, expect, it } from 'vitest';
import { canonicalPath, canonicalUrl } from './meta';
import { absoluteUrl, SHARE_IMAGE, SITE_URL } from './site';

describe('站点地址的配置', () => {
  it('是 https 的域名，不带路径和末尾的斜杠', () => {
    expect(SITE_URL).toMatch(/^https:\/\/[a-z0-9.-]+$/);
    expect(new URL(SITE_URL).origin).toBe(SITE_URL);
  });

  it('不是 workers.dev 地址（账号子域名是个人信息）', () => {
    expect(SITE_URL).not.toMatch(/workers\.dev/i);
  });

  it('absoluteUrl 把站内路径拼成完整地址', () => {
    expect(absoluteUrl('/')).toBe(`${SITE_URL}/`);
    expect(absoluteUrl('/contact/')).toBe(`${SITE_URL}/contact/`);
    expect(absoluteUrl(SHARE_IMAGE.path)).toBe(`${SITE_URL}/share/clinkai.png`);
  });
});

describe('页面的规范路径', () => {
  it.each([
    ['/', '/'],
    ['/index.html', '/'],
    ['/contact/', '/contact/'],
    ['/contact', '/contact/'],
    ['/contact/index.html', '/contact/'],
    ['/privacy.html', '/privacy/'],
    ['/a/b', '/a/b/'],
  ])('%s → %s', (pathname, expected) => {
    expect(canonicalPath(pathname)).toBe(expected);
  });

  it('规范地址带正式域名', () => {
    expect(canonicalUrl('/contact')).toBe(`${SITE_URL}/contact/`);
    expect(canonicalUrl('/')).toBe(`${SITE_URL}/`);
  });
});
