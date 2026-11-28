import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import mp4 from '../assets/video/creator-pebble.mp4?inline';
import webm from '../assets/video/creator-pebble.webm?inline';
import ExampleVideo from './ExampleVideo.astro';
import { canPlay } from './video';

// 文件内容读成「每个字节一个字符」的字符串，方便按字节找容器里的标记
function bytes(dataUrl: string): string {
  return atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
}

/** MP4：每条轨道的 hdlr 盒子里写着轨道类型，vide 是画面，soun 是声音 */
function mp4Handlers(file: string): string[] {
  const handlers: string[] = [];
  // 盒子结构：长度(4) 'hdlr'(4) 版本和标志(4) pre_defined(4) 轨道类型(4)
  for (
    let at = file.indexOf('hdlr');
    at >= 0;
    at = file.indexOf('hdlr', at + 1)
  ) {
    handlers.push(file.slice(at + 12, at + 16));
  }
  return handlers;
}

/** WebM：第一个 Cluster 之前是文件头，每条轨道写着 TrackType（1 画面，2 声音）和编码 */
function webmTracks(file: string): { types: number[]; codecs: string[] } {
  const header = file.slice(0, file.indexOf('\x1F\x43\xB6\x75'));
  return {
    // TrackType 的 ID 是 0x83，长度 1 个字节（0x81）
    types: [...header.matchAll(/\x83\x81([\s\S])/g)].map((match) =>
      match[1]!.charCodeAt(0),
    ),
    codecs: [...header.matchAll(/[AVS]_[A-Z0-9/]+/g)].map((match) => match[0]),
  };
}

describe('示例视频的文件：只有画面，没有声轨', () => {
  it('mp4：有一条画面轨道，没有声音轨道', () => {
    const handlers = mp4Handlers(bytes(mp4));

    expect(handlers).toContain('vide');
    expect(handlers).not.toContain('soun');
  });

  it('mp4：索引在数据前面，下载到一点就能开始播', () => {
    const file = bytes(mp4);

    expect(file.indexOf('moov')).toBeGreaterThan(0);
    expect(file.indexOf('moov')).toBeLessThan(file.indexOf('mdat'));
  });

  it('webm：只有一条 VP9 画面轨道', () => {
    expect(webmTracks(bytes(webm))).toEqual({ types: [1], codecs: ['V_VP9'] });
  });
});

describe('ExampleVideo 组件', () => {
  const props = {
    name: 'creator-pebble',
    poster: 'ugc_pebble.jpg',
    posterAlt: '示例达人视频的封面',
    label: '示例达人视频，8 秒，无声',
    width: 434,
    height: 760,
  };

  async function render(): Promise<string> {
    const container = await AstroContainer.create();
    return container.renderToString(ExampleVideo, { props });
  }

  it('webm 在前、mp4 在后，两个都带', async () => {
    const html = await render();
    const sources = [
      ...html.matchAll(/<source src="([^"]+)" type="(video\/[\w]+)"/g),
    ].map((match) => match[2]);

    expect(sources).toEqual(['video/webm', 'video/mp4']);
    expect(html).toMatch(/<source src="[^"]*creator-pebble[^"]*\.webm"/);
    expect(html).toMatch(/<source src="[^"]*creator-pebble[^"]*\.mp4"/);
  });

  it('永远静音、不显示控制条、进入视口才加载', async () => {
    const video = /<video [^>]*>/.exec(await render())?.[0] ?? '';

    expect(video).toMatch(/ muted[ >]/);
    expect(video).toMatch(/ playsinline[ >]/);
    expect(video).toContain('preload="none"');
    expect(video).toContain(`aria-label="${props.label}"`);
    expect(video).not.toMatch(/ (controls|autoplay)[ >=]/);
  });

  it('下面垫着封面图：走图片管线，延迟加载', async () => {
    const html = await render();
    const poster = html.slice(0, html.indexOf('<video'));

    expect(poster).toContain('<source type="image/avif"');
    expect(poster).toContain(`alt="${props.posterAlt}"`);
    expect(poster).toContain('loading="lazy"');
    expect(poster).toContain('class="example-video-fill"');
  });
});

describe('什么时候播', () => {
  it('只有桌面、没开减少动态效果时才播，其余只显示封面图', () => {
    expect(canPlay({ reducedMotion: false, phone: false })).toBe(true);
    expect(canPlay({ reducedMotion: true, phone: false })).toBe(false);
    expect(canPlay({ reducedMotion: false, phone: true })).toBe(false);
    expect(canPlay({ reducedMotion: true, phone: true })).toBe(false);
  });
});
