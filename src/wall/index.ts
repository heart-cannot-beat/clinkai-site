// 站点上的那面版本墙。构建时生成一次：VersionWall 组件用它输出小图，
// 页面上的计数（版本数、语言数、尺寸数）读它的 counts，不手写。
// 墙里的图走站点统一的图片管线（src/media/）：AVIF 和 WebP、多尺寸、延迟加载。

import {
  pictureHtml,
  preparePicture,
  type PreparedPicture,
} from '../media/picture';
import { pebblesoundWall, wallImageFiles } from './config';
import { generateWall } from './generate';

// 先把墙里用到的图都转好（构建时，异步），生成小图时再按每张图的显示大小写 sizes
const pictures = new Map<string, PreparedPicture>(
  await Promise.all(
    wallImageFiles(pebblesoundWall).map(
      async (file) => [file, await preparePicture(file)] as const,
    ),
  ),
);

export const versionWall = generateWall(
  pebblesoundWall,
  ({ file, ...options }) => {
    const picture = pictures.get(file);
    if (!picture) throw new Error(`版本墙的图没有登记：${file}`);
    return pictureHtml(picture, options);
  },
);
