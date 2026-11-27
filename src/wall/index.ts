// 站点上的那面版本墙。构建时从设计侧的定稿数据读一次：VersionWall 组件用它输出小图，
// 页面上的计数（版本数、语言数、尺寸数）读它的 counts，不手写。

import designWall from '../../design/wall/tiles.json';
import { wallImageUrl } from './images';
import { buildWall } from './wall';

export const versionWall = buildWall(designWall, wallImageUrl);
