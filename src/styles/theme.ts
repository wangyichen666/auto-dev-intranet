import type { ThemeConfig } from 'antd';
export function theme(): ThemeConfig {
  const tokens = getComputedStyle(document.documentElement);
  const color = (name: string) => tokens.getPropertyValue(name).trim();
  return { token: { colorPrimary: color('--accent'), colorBgLayout: color('--page'), colorText: color('--text'), colorBorder: color('--border-strong'), colorSuccess: color('--success'), colorWarning: color('--warning'), colorError: color('--danger'), colorInfo: color('--info'), borderRadius: 6, fontSize: 14, controlHeight: 34 }, components: { Table: { headerBg: color('--page'), cellPaddingBlock: 15 }, Tabs: { inkBarColor: color('--accent') } } };
}
