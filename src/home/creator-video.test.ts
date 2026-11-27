import { describe, expect, it } from 'vitest';
import {
  PHONE_QUERY,
  PLAYING_ATTRIBUTE,
  REDUCED_MOTION_QUERY,
  setupCreatorVideo,
  type CreatorVideo,
  type CreatorVideoEnvironment,
  type MediaCondition,
} from './creator-video';

// 04 屏中间那条视频的播放规则和三条退路（design/motion.md「04 达人」）。
// 用假的 <video>、matchMedia 和视口观察来测，不需要浏览器。

class FakeVideo implements CreatorVideo {
  muted = false;
  currentTime = 3.5;
  paused = true;
  playCalls = 0;
  /** 模拟浏览器不让自动播放，或者文件加载失败 */
  failPlay = false;
  readonly attributes = new Set<string>();
  private readonly listeners = new Map<string, (() => void)[]>();

  play(): Promise<void> {
    this.playCalls += 1;
    if (this.failPlay) return Promise.reject(new Error('NotAllowedError'));
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }

  setAttribute(name: string): void {
    this.attributes.add(name);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  /** 浏览器发出事件 */
  emit(type: 'playing' | 'error'): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  get shown(): boolean {
    return this.attributes.has(PLAYING_ATTRIBUTE);
  }
}

class FakeCondition implements MediaCondition {
  private readonly listeners: (() => void)[] = [];

  constructor(public matches: boolean) {}

  addEventListener(_type: 'change', listener: () => void): void {
    this.listeners.push(listener);
  }

  set(matches: boolean): void {
    this.matches = matches;
    for (const listener of this.listeners) listener();
  }
}

function setup(start: { reducedMotion?: boolean; phone?: boolean } = {}) {
  const video = new FakeVideo();
  const reducedMotion = new FakeCondition(start.reducedMotion ?? false);
  const phone = new FakeCondition(start.phone ?? false);
  let report: (visible: boolean) => void = () => {};
  const environment: CreatorVideoEnvironment = {
    matchMedia(query) {
      if (query === REDUCED_MOTION_QUERY) return reducedMotion;
      if (query === PHONE_QUERY) return phone;
      throw new Error(`没想到会查这个：${query}`);
    },
    watchVisibility(onChange) {
      report = onChange;
    },
  };

  setupCreatorVideo(video, environment);

  return {
    video,
    reducedMotion,
    phone,
    /** 视频进入视口并真的播起来 */
    enter() {
      report(true);
      if (!video.paused) video.emit('playing');
    },
    leave: () => report(false),
    scroll: (visible: boolean) => report(visible),
  };
}

describe('达人示例视频：播放规则', () => {
  it('永远静音', () => {
    const { video } = setup();

    expect(video.muted).toBe(true);
  });

  it('进入视口之前不播放，也不显示', () => {
    const { video } = setup();

    expect(video.playCalls).toBe(0);
    expect(video.shown).toBe(false);
  });

  it('进入视口：从头播放，真的播起来以后才显示', () => {
    const { video, scroll } = setup();

    scroll(true);

    expect(video.playCalls).toBe(1);
    expect(video.currentTime).toBe(0);
    expect(video.shown).toBe(false);

    video.emit('playing');

    expect(video.shown).toBe(true);
  });

  it('离开视口：暂停，回到封面图', () => {
    const { video, enter, leave } = setup();

    enter();
    leave();

    expect(video.paused).toBe(true);
    expect(video.shown).toBe(false);
  });

  it('再进入视口：又从头播', () => {
    const { video, enter, leave } = setup();

    enter();
    video.currentTime = 5;
    leave();
    enter();

    expect(video.playCalls).toBe(2);
    expect(video.currentTime).toBe(0);
    expect(video.shown).toBe(true);
  });

  it('还在视口里时重复收到「看得见」，不会把正在播的视频拉回开头', () => {
    const { video, enter, scroll } = setup();

    enter();
    video.currentTime = 5;
    scroll(true);

    expect(video.playCalls).toBe(1);
    expect(video.currentTime).toBe(5);
  });
});

describe('达人示例视频：三条退路都只显示封面图', () => {
  it('系统开了「减少动态效果」：不播放', () => {
    const { video, enter } = setup({ reducedMotion: true });

    enter();

    expect(video.playCalls).toBe(0);
    expect(video.shown).toBe(false);
  });

  it('播放中途开了「减少动态效果」：停下来，回到封面图；关掉以后从头播', () => {
    const { video, enter, reducedMotion } = setup();

    enter();
    reducedMotion.set(true);

    expect(video.paused).toBe(true);
    expect(video.shown).toBe(false);

    reducedMotion.set(false);

    expect(video.playCalls).toBe(2);
    expect(video.currentTime).toBe(0);
  });

  it('手机：不播放', () => {
    const { video, enter } = setup({ phone: true });

    enter();

    expect(video.playCalls).toBe(0);
    expect(video.shown).toBe(false);
  });

  it('视频加载失败或浏览器不让自动播放：不报错，一直显示封面图', async () => {
    const { video, scroll } = setup();
    video.failPlay = true;

    scroll(true);
    // 等 play() 的拒绝被接住；没接住的话 Vitest 会把它当成未处理的错误让测试失败
    await Promise.resolve();

    expect(video.playCalls).toBe(1);
    expect(video.shown).toBe(false);
  });

  it('播着播着出错：回到封面图', () => {
    const { video, enter } = setup();

    enter();
    video.emit('error');

    expect(video.shown).toBe(false);
  });

  it('已经离开视口才迟到的 playing 事件不会把视频显示出来', () => {
    const { video, scroll } = setup();

    scroll(true);
    scroll(false);
    video.emit('playing');

    expect(video.shown).toBe(false);
  });
});
