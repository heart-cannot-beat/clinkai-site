import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import { exampleImageFiles } from '../src/media/catalog';
import { HERO_BOARD_IMAGES } from '../src/media/hero';
import MediaPage from '../src/pages/media.astro';

let html: string;

beforeAll(async () => {
  const container = await AstroContainer.create();
  html = await container.renderToString(MediaPage);
});

describe('示例素材陈列页', () => {
  it('不让搜索引擎收录', () => {
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it('每张示例图都在，都是 AVIF 在前、WebP 兜底的 <picture>', () => {
    const pictures = html.match(/<picture>/g) ?? [];
    const avif = html.match(/<source type="image\/avif"/g) ?? [];

    for (const file of exampleImageFiles) {
      expect(html, file).toContain(file.replace(/\.\w+$/, ''));
    }
    expect(pictures.length).toBe(avif.length);
    expect(pictures.length).toBeGreaterThanOrEqual(exampleImageFiles.length);
  });

  it('只有首屏叠板的三张不延迟加载', () => {
    const eager = [...html.matchAll(/<img [^>]*loading="eager"[^>]*>/g)];

    expect(eager).toHaveLength(HERO_BOARD_IMAGES.length);
    HERO_BOARD_IMAGES.forEach((file, index) => {
      expect(eager[index]?.[0]).toContain(file.replace(/\.\w+$/, ''));
    });
  });

  it('全部示例图那一节，每张都标了「示例」', () => {
    const cards = html.match(/<li class="card"[\s\S]*?<\/li>/g) ?? [];

    expect(cards).toHaveLength(exampleImageFiles.length);
    for (const card of cards) expect(card).toContain('示例');
  });

  it('有达人示例视频和版本墙', () => {
    expect(html).toMatch(/<video [^>]*data-example-video/);
    expect(html).toContain('aria-label="示例：同一个降噪耳机广告创意的');
  });
});
