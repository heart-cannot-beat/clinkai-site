// 页头上的导航。文字照抄 design/copy.md「所有页面共用」，不要改写。
//
// 导航项的链接地址现在先照设计稿里的锚点写（#services、#work、#products、#about）。
// 首页和子页面做出来以后（P-01、P-03），在这里改成真实地址，页头组件不用动。
// 「预约沟通」已经是真实地址（P-04，src/pages/contact.astro）。

export type NavKey = 'services' | 'work' | 'products' | 'about';

export interface NavItem {
  readonly key: NavKey;
  readonly label: string;
  readonly href: string;
}

export const HOME_HREF = '/';

/** 标志的无障碍名称（设计稿 screens/*.html 里的 aria-label） */
export const LOGO_LABEL = 'ClinkAI 首页';
export const LOGO_TEXT = 'CLINKAI';

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'services', label: '增长服务 ↗', href: '#services' },
  { key: 'work', label: '作品 ↗', href: '#work' },
  { key: 'products', label: '我们的产品 ↗', href: '#products' },
  { key: 'about', label: '关于我们 ↗', href: '#about' },
];

/** 「预约沟通 →」按钮。箭头单独放，读屏时不念 */
export const CONTACT_CTA = { label: '预约沟通', arrow: '→', href: '/contact/' };

/** 菜单按钮的无障碍名称（design/copy.md） */
export const MENU_LABEL = '打开菜单';

/** 右下角的滚动提示（design/copy.md） */
export const SCROLL_HINT = 'SCROLL ↓';
