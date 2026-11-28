// 全站只有这一个文件直接引 GSAP（经 npm 打包，不引在线地址）。
// 它只能用 import() 按需加载（见 start.ts）：手机、微信内置浏览器、「减少动态效果」下
// 页面不会请求这个文件。别的地方只引 GSAP 的类型；tests/scenes.test.ts 会查。
// 许可：GSAP 自家的免费许可（不是 MIT），见 docs/scenes.md。
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export { gsap, ScrollTrigger };
