import { Tag } from 'antd';
import { RefreshCcw } from '@sofa-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../services/api';
import { useLocale } from '../locales';
import { EmptyState, ErrorState, IconButton, LoadingState, Metadata, PageHeader, PageLayout, PagePanel } from '../components/common';
import styles from './catalog.module.less';
export function Repositories() {
  const api = useApi(); const { t } = useLocale(); const result = useQuery({ queryKey: ['repositories'], queryFn: ({ signal }) => api.repositories(signal) });
  return <PageLayout><PageHeader title={t('repositories')} description={t('repositoryDescription')} actions={<><Tag>{t('readonly')}</Tag><IconButton label={t('refresh')} loading={result.isFetching} icon={<RefreshCcw/>} onClick={() => void result.refetch()}/></>}/><PagePanel>{result.isPending ? <LoadingState/> : result.error ? <ErrorState error={result.error} retry={() => void result.refetch()}/> : !result.data?.length ? <EmptyState title="noRepositories" description="noRepositoriesDescription"/> : <div className={styles.entries}>{result.data.map(r => <article className={styles.repository} key={r.repositoryId}><h2>{r.name}</h2><div className={styles.repositoryMetadata}><Metadata rows={[[t('provider'), r.provider], [t('project'), r.project || '—'], [t('remote'), <span className="mono">{r.remote}</span>]]}/><Metadata rows={[[t('baseBranch'), r.baseBranch], [t('pipeline'), t(r.pipelineEnabled ? 'enabled' : 'disabled')], [t('capability'), t(r.capability === 'OFFLINE' ? 'offline' : 'configured')]]}/></div></article>)}</div>}</PagePanel></PageLayout>;
}
