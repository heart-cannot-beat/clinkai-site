import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import { exampleImageFiles } from './catalog';
import ExampleImage from './ExampleImage.astro';
import {
  pictureAttributes,
  pictureHtml,
  preparePicture,
  type PreparedPicture,
} from './picture';
import { candidateWidths } from './responsive';

/** srcset 里每一项的宽度和格式。测试里是开发服务器的 /_image?…&w=…&f=… 地址 */
function candidates(srcset: string) {
  return srcset.split(', ').map((entry) => {
    const [url, descriptor] = entry.split(' ');
    return {
      width: Number(descriptor?.replace(/w$/, '')),
      format: new URLSearchParams(url?.split('?')[1]).get('f'),
    };
  });
}

describe('每张示例图都转成 AVIF 和 WebP，每种都有多个尺寸', () => {
  it('图片目录里有图', () => {
    expect(exampleImageFiles.length).toBe(28);
  });

  it.each(exampleImageFiles)('%s', async (file) => {
    const picture = await preparePicture(file);
    const widths = candidateWidths(picture.width);
    const avif = candidates(picture.avifSrcset);
    const webp = candidates(picture.srcset);

    expect(widths.length).toBeGreaterThanOrEqual(2);
    expect(avif).toEqual(widths.map((width) => ({ width, format: 'avif' })));
    expect(webp).toEqual(widths.map((width) => ({ width, format: 'webp' })));
    expect(new URLSearchParams(picture.src.split('?')[1]).get('f')).toBe(
      'webp',
    );
  });

  it('同一张图只转一次：多处使用拿到的是同一份', async () => {
    expect(preparePicture('acme_moon.jpg')).toBe(
      preparePicture('acme_moon.jpg'),
    );
  });
});

const picture: PreparedPicture = {
  file: 'pebble_trumpet.jpg',
  width: 1536,
  height: 1024,
  avifSrcset: '/a-320.avif 320w, /a-640.avif 640w',
  src: '/b.webp?x=1&y=2',
  srcset: '/b-320.webp 320w, /b-640.webp 640w',
};

describe('<picture> 的属性', () => {
  it('默认延迟加载、异步解码，alt 为空', () => {
    const { source, img } = pictureAttributes(picture, { width: 200 });

    expect(source).toEqual({
      type: 'image/avif',
      srcset: picture.avifSrcset,
      sizes: '(min-width: 1440px) 13.89vw, 200px',
    });
    expect(img).toEqual({
      src: picture.src,
      srcset: picture.srcset,
      sizes: source.sizes,
      width: 1536,
      height: 1024,
      alt: '',
      loading: 'lazy',
      decoding: 'async',
    });
  });

  it('首屏的图：立即加载、优先下载', () => {
    const { img } = pictureAttributes(picture, {
      width: 381,
      priority: true,
      alt: '示例广告',
    });

    expect(img).toMatchObject({
      loading: 'eager',
      fetchpriority: 'high',
      alt: '示例广告',
    });
    expect(img).not.toHaveProperty('decoding');
  });

  it('给了框就按 cover 铺开的宽度写 sizes', () => {
    const { img } = pictureAttributes(picture, { width: 140, height: 296 });

    expect(img.sizes).toBe('(min-width: 1440px) 30.83vw, 444px');
  });

  it('拼成 HTML 字符串时转义属性值', () => {
    const html = pictureHtml(picture, {
      width: 200,
      style: 'position: absolute; inset: 0',
    });

    expect(html).toBe(
      '<picture><source type="image/avif" srcset="/a-320.avif 320w, /a-640.avif 640w" sizes="(min-width: 1440px) 13.89vw, 200px">' +
        '<img src="/b.webp?x=1&amp;y=2" srcset="/b-320.webp 320w, /b-640.webp 640w" sizes="(min-width: 1440px) 13.89vw, 200px" width="1536" height="1024" alt="" loading="lazy" decoding="async" style="position: absolute; inset: 0"></picture>',
    );
  });
});

describe('ExampleImage 组件', () => {
  async function render(props: Record<string, unknown>): Promise<string> {
    const container = await AstroContainer.create();
    return container.renderToString(ExampleImage, { props });
  }

  it('输出和版本墙同一套 <picture>', async () => {
    const html = await render({ file: 'acme_moon.jpg', width: 381 });
    const prepared = await preparePicture('acme_moon.jpg');

    expect(html).toMatch(
      /^<picture>\s*<source type="image\/avif" [^>]+>\s*<img [^>]+>\s*<\/picture>$/,
    );
    // Astro 把空的 alt="" 写成 alt，两种写法在 HTML 里是一回事
    expect(
      html.replace(/>\s+</g, '><').replace(/ alt(?=[ >])/, ' alt=""'),
    ).toBe(pictureHtml(prepared, { width: 381 }));
  });

  it('class 落到 <img> 上，首屏的图不延迟加载', async () => {
    const html = await render({
      file: 'dew_dots.jpg',
      width: 381,
      height: 381,
      priority: true,
      class: 'board',
    });

    expect(html).toContain('class="board"');
    expect(html).toContain('loading="eager"');
    expect(html).toContain('fetchpriority="high"');
    expect(html).not.toContain('loading="lazy"');
  });
});
