import { Alert, Tag } from 'antd';
import { RefreshCcw } from '@sofa-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from '../locales';
import { useApi } from '../services/api';
import { dateTime } from '../services/time';
import { ErrorState, IconButton, LoadingState, Metadata, PageHeader, PageLayout, PagePanel } from '../components/common';
import styles from './catalog.module.less';
export function System() {
  const api = useApi(); const { t, locale } = useLocale(); const result = useQuery({ queryKey: ['health'], queryFn: ({ signal }) => api.health(signal) });
  const h = result.data;
  return <PageLayout><PageHeader title={t('system')} description={t('systemDescription')} actions={<IconButton label={t('refresh')} icon={<RefreshCcw/>} loading={result.isFetching} onClick={() => void result.refetch()}/>}/>{result.isPending ? <LoadingState/> : !h ? <ErrorState error={result.error ?? new Error(t('failedLoad'))} retry={() => void result.refetch()}/> : <>
    <div className={styles.systemSummary}><Tag color={h.upstreamAvailable ? 'success' : 'error'}>{t(h.upstreamAvailable ? 'healthy' : 'unavailable')}</Tag>{h.diagnostics.some(d => d.code === 'TEST_ONLY') && <Tag>{t('testEnvironment')}</Tag>}{h.daemon === 'STOPPED' && <Alert type="warning" message={t('daemonDescription')}/>}</div>
    <div className={styles.systemLayout}><PagePanel className={styles.systemPanel}><h2>{t('system')}</h2><Metadata rows={[[t('bff'), `v${h.bffVersion}`], [t('upstream'), h.upstreamAvailable ? `v${h.upstreamVersion}` : t('unavailable')], [t('version'), <span className="mono">{h.upstreamCommit}</span>], [t('database'), t(h.databaseReachable ? 'reachable' : 'unreachable')], [t('stateDirectory'), t(h.stateReachable ? 'reachable' : 'unreachable')], [t('daemon'), t(h.daemon === 'RUNNING' ? 'RUNNING' : h.daemon === 'STOPPED' ? 'daemonStopped' : h.daemon === 'STALE' ? 'daemonStale' : 'unknown')], [t('lastHeartbeat'), dateTime(h.lastHeartbeat, locale)], [t('authState'), t('notProbed')]]}/><div className={styles.systemRow}><h3>{t('diagnostics')}</h3>{h.diagnostics.map(d => <div key={d.code} className={styles.diagnostic}><code>{d.code}</code><p>{d.message}</p></div>)}</div></PagePanel>
    <PagePanel className={styles.systemPanel}><h2>{t('capability')}</h2><div className={styles.systemRow}><h3>{t('availableAgents')}</h3><div className={styles.chips}>{h.agents.length ? h.agents.map(a => <Tag key={a}>{a}</Tag>) : <p className="muted">{t('noData')}</p>}</div></div><div className={styles.systemRow}><h3>{t('availableTools')}</h3><div className={styles.chips}>{h.tools.length ? h.tools.map(a => <Tag key={a}>{a}</Tag>) : <p className="muted">{t('noData')}</p>}</div></div></PagePanel></div>
    </>}
  </PageLayout>;
}
