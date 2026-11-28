// 页头上的导航。文字照抄 design/copy.md「所有页面共用」，不要改写。
//
// 「我们的产品」「关于我们」是真实地址（P-03，src/pages/products.astro、about.astro），
// 「预约沟通」也是（P-04，src/pages/contact.astro）。页头组件和首页结尾屏的按钮都从这里读。
// 「增长服务」「作品」在交接包里还没有对应的页面或屏，先照设计稿里的锚点写（#services、#work），
// 去处等设计侧定（见 Issue #12）。

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
  { key: 'products', label: '我们的产品 ↗', href: '/products/' },
  { key: 'about', label: '关于我们 ↗', href: '/about/' },
];

/** 「预约沟通 →」按钮。箭头单独放，读屏时不念 */
export const CONTACT_CTA = { label: '预约沟通', arrow: '→', href: '/contact/' };

/** 菜单按钮的无障碍名称（design/copy.md） */
export const MENU_LABEL = '打开菜单';

/** 右下角的滚动提示（design/copy.md） */
export const SCROLL_HINT = 'SCROLL ↓';
