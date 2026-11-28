import { describe, expect, it } from 'vitest';
import { sceneBootScript } from './boot';
import {
  resolveSceneMode,
  SCENE_MODE_ATTRIBUTE,
  SCENE_SCALE_PROPERTY,
  STATIC_QUERY,
  type SceneMode,
} from './mode';
import {
  DESKTOP,
  type FakeDevice,
  matchesQuery,
  PHONE,
  runBootScript,
  TABLET,
  WECHAT_IPHONE,
  WECHAT_WINDOWS,
} from './test-helpers';

// 运行时的判断（start.ts 就是这么接的）
const runtimeMode = (device: FakeDevice) =>
  resolveSceneMode({
    staticMedia: matchesQuery(STATIC_QUERY, device),
    userAgent: device.userAgent,
  });

// 内联脚本的判断（画出第一帧之前）
const bootMode = (device: FakeDevice) =>
  runBootScript(device).root.getAttribute(SCENE_MODE_ATTRIBUTE);

const CASES: [string, FakeDevice, SceneMode][] = [
  ['桌面浏览器', DESKTOP, 'motion'],
  ['桌面，窗口正好 768 宽', { ...DESKTOP, width: 768 }, 'motion'],
  [
    '桌面，系统开了「减少动态效果」',
    { ...DESKTOP, reducedMotion: true },
    'static',
  ],
  ['桌面，窗口拉窄到 767', { ...DESKTOP, width: 767 }, 'static'],
  ['手机竖屏', PHONE, 'static'],
  ['手机横屏', { ...PHONE, width: 844, height: 390 }, 'static'],
  ['平板', TABLET, 'static'],
  [
    '电脑上的微信内置浏览器',
    { ...DESKTOP, userAgent: WECHAT_WINDOWS },
    'static',
  ],
  ['手机上的微信内置浏览器', { ...PHONE, userAgent: WECHAT_IPHONE }, 'static'],
];

describe('退路：什么时候显示静态帧', () => {
  it.each(CASES)('%s', (_name, device, expected) => {
    expect(runtimeMode(device)).toBe(expected);
  });

  it.each(CASES)('内联脚本和运行时判断一致：%s', (_name, device, expected) => {
    expect(bootMode(device)).toBe(expected);
  });
});

describe('画出第一帧之前跑的内联脚本', () => {
  it('一页有好几个场景时只有第一段起作用，不改已经定下的结果', () => {
    const { root } = runBootScript({ ...DESKTOP, reducedMotion: true });
    expect(root.getAttribute(SCENE_MODE_ATTRIBUTE)).toBe('static');

    runBootScript(DESKTOP, root);

    expect(root.getAttribute(SCENE_MODE_ATTRIBUTE)).toBe('static');
  });

  it('把画布的缩放比例记在 <html> 上：「宽 ÷ 1440」和「高 ÷ 900」里小的那个，窗口大小变了跟着改', () => {
    const { root, resize } = runBootScript(DESKTOP);
    const scale = () =>
      Number(root.style.getPropertyValue(SCENE_SCALE_PROPERTY));

    expect(scale()).toBe(1);

    // 比 16:10 宽：高度先顶到头
    resize(1920, 1080);
    expect(scale()).toBeCloseTo(1.2);

    // 比 16:10 窄：宽度先顶到头
    resize(1200, 900);
    expect(scale()).toBeCloseTo(1200 / 1440);
  });

  it('不引任何在线地址', () => {
    expect(sceneBootScript).not.toMatch(/https?:|\/\//);
  });
});
