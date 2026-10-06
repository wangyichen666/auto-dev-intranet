import { useState } from 'react';
import { Drawer } from 'antd';
import { Console, ListTodo, Yaml, FolderCog, Menu, LogOut, ArrowLeftRight, Terminal } from '@sofa-design/icons';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { IconButton } from '../components/common';
import { useLocale } from '../locales';
import { useApi } from '../services/api';
import styles from './shell.module.less';
const nav = [{ path: '/tasks', key: 'tasks', icon: ListTodo }, { path: '/workflows', key: 'workflows', icon: Yaml }, { path: '/repositories', key: 'repositories', icon: FolderCog }, { path: '/system', key: 'system', icon: Console }] as const;
export function Shell({ onDisconnect }: { onDisconnect: () => void }) {
  const [drawer, setDrawer] = useState(false); const { t, locale, setLocale } = useLocale(); const location = useLocation(); const api = useApi();
  const health = useQuery({ queryKey: ['health'], queryFn: ({ signal }) => api.health(signal), refetchInterval: 30000, refetchIntervalInBackground: false });
  const current = nav.find(n => location.pathname.startsWith(n.path)) ?? nav[0];
  const navigation = <nav className={styles.navigation} aria-label={t('navigation')}>{nav.map(n => <NavLink key={n.path} to={n.path} onClick={() => setDrawer(false)} className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}><n.icon/>{t(n.key)}</NavLink>)}</nav>;
  return <div className={styles.shell}><aside className={styles.sidebar}><div className={styles.brand}><span className={styles.brandMark}><Terminal width={20}/></span><div><div className={styles.brandName}>{t('product')}</div><div className={styles.subtitle}>{t('subtitle')}</div></div></div>{navigation}<div className={styles.bottom}>{t('workspace')}<br/><span className="mono">v{health.data?.bffVersion ?? '0.1.0'}</span></div></aside>
    <div className={styles.topbar}><div className={styles.context}><span className={styles.mobileMenu}><IconButton type="text" label={t('menu')} icon={<Menu/>} onClick={() => setDrawer(true)}/></span><span className={styles.workspace}>{t('workspace')}</span><span className={styles.contextDivider}/><span>{t(current.key)}</span></div><div className={styles.tools}><span className={styles.connection}><span className={`${styles.indicator} ${health.data?.upstreamAvailable ? '' : styles.offline}`}/>{t(health.data?.upstreamAvailable ? 'connected' : 'disconnected')}</span><IconButton type="text" label={t('language')} icon={<ArrowLeftRight/>} onClick={() => setLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}/><IconButton type="text" label={t('signOut')} icon={<LogOut/>} onClick={onDisconnect}/></div></div>
    <main><Outlet/></main><Drawer title={t('product')} open={drawer} onClose={() => setDrawer(false)} placement="left" width={260}>{navigation}</Drawer>
  </div>;
}
