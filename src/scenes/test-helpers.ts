// 场景测试用的假设备。媒体查询按退路规则用到的那几种写法来判断，够用就行；
// 碰到不认识的写法直接报错，免得规则改了、测试还在悄悄通过。
import { Window } from 'happy-dom';
import { sceneBootScript } from './boot';

export interface FakeDevice {
  width: number;
  height: number;
  /** 主要靠手指操作、没有悬停（手机、平板） */
  touch: boolean;
  /** 系统开了「减少动态效果」 */
  reducedMotion: boolean;
  userAgent: string;
}

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const SAFARI_IPAD =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

export const WECHAT_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x18003233) NetType/WIFI Language/zh_CN';
export const WECHAT_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36 NetType/WIFI MicroMessenger/7.0.20.1781(0x6700143B) WindowsWechat(0x63090a13) XWEB/8555';

export const DESKTOP: FakeDevice = {
  width: 1440,
  height: 900,
  touch: false,
  reducedMotion: false,
  userAgent: CHROME_MAC,
};

export const PHONE: FakeDevice = {
  width: 390,
  height: 844,
  touch: true,
  reducedMotion: false,
  userAgent: SAFARI_IPHONE,
};

export const TABLET: FakeDevice = {
  width: 1024,
  height: 1366,
  touch: true,
  reducedMotion: false,
  userAgent: SAFARI_IPAD,
};

function matchesFeature(feature: string, device: FakeDevice): boolean {
  if (feature === '(prefers-reduced-motion: reduce)') {
    return device.reducedMotion;
  }
  if (feature === '(hover: none)' || feature === '(pointer: coarse)') {
    return device.touch;
  }
  const maxWidth = /^\(max-width: (\d+)px\)$/.exec(feature);
  if (maxWidth) return device.width <= Number(maxWidth[1]);
  throw new Error(`假设备不认识这条媒体查询：${feature}`);
}

/** 逗号是「或」，and 是「且」 */
export function matchesQuery(query: string, device: FakeDevice): boolean {
  return query.split(',').some((part) =>
    part
      .trim()
      .split(/\s+and\s+/)
      .every((feature) => matchesFeature(feature.trim(), device)),
  );
}

/**
 * 在假设备上跑一遍 Scene.astro 放进页面的那段内联脚本。
 * 返回 <html> 和一个改窗口大小的函数（改完会通知脚本登记的 resize 监听）。
 */
export function runBootScript(
  device: FakeDevice,
  root: HTMLElement = new Window().document
    .documentElement as unknown as HTMLElement,
) {
  const size = { width: device.width, height: device.height };
  Object.defineProperty(root, 'clientWidth', {
    get: () => size.width,
    configurable: true,
  });

  const onResize: (() => void)[] = [];
  const fakeWindow = {
    get innerHeight() {
      return size.height;
    },
    matchMedia: (query: string) => ({ matches: matchesQuery(query, device) }),
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'resize') onResize.push(listener);
    },
  };

  new Function('window', 'document', 'navigator', sceneBootScript)(
    fakeWindow,
    root.ownerDocument,
    { userAgent: device.userAgent },
  );

  return {
    root,
    resize(width: number, height: number) {
      size.width = width;
      size.height = height;
      for (const listener of onResize) listener();
    },
  };
}
