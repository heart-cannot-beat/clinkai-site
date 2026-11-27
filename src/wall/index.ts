// 站点上的那面版本墙。构建时生成一次：VersionWall 组件用它输出小图，
// 页面上的计数（版本数、语言数、尺寸数）读它的 counts，不手写。

import { pebblesoundWall } from './config';
import { generateWall } from './generate';
import { wallImageUrl } from './images';

export const versionWall = generateWall(pebblesoundWall, wallImageUrl);
