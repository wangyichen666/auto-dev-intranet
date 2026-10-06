import { useEffect, useState } from 'react';
import { Alert, Button, Input, Pagination, Table } from 'antd';
import { Plus, RefreshCcw, Search, ChevronRight, Pause } from '@sofa-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { CreateTask } from '../components/CreateTask';
import { EmptyState, ErrorNotice, ErrorState, IconButton, LoadingState, PageHeader, PageLayout, PagePanel, StatusTag, TextIconButton } from '../components/common';
import { useLocale } from '../locales';
import { useApi } from '../services/api';
import { dateTime, duration } from '../services/time';
import { isActive, useVisible } from '../services/polling';
import type { Run, Status } from '../typings/api';
import styles from './tasks.module.less';
const statuses: Status[] = ['QUEUED', 'RUNNING', 'WAITING', 'PAUSED', 'SUCCEEDED', 'FAILED', 'CANCELLED'];
export function Tasks() {
  const { t, locale } = useLocale(); const api = useApi(); const visible = useVisible(); const navigate = useNavigate(); const queryClient = useQueryClient(); const [params, setParams] = useSearchParams(); const [modal, setModal] = useState(false);
  const status = statuses.includes(params.get('status') as Status) ? params.get('status') as Status : '';
  const page = Math.min(10000, Math.max(1, Number(params.get('page')) || 1)); const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize')) || 20));
  const query = params.get('query') ?? ''; const [input, setInput] = useState(query);
  useEffect(() => { setInput(query); }, [query]);
  const normalized = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...(status ? { status } : {}), ...(query ? { query } : {}) });
  const result = useQuery({ queryKey: ['runs', normalized.toString()], queryFn: ({ signal }) => api.runs(normalized, signal), refetchInterval: q => visible && q.state.data?.items.some(r => isActive(r.status)) ? 5000 : false, refetchIntervalInBackground: false });
  const update = (patch: Record<string, string>) => { const next = new URLSearchParams(params); for (const [key, val] of Object.entries(patch)) { if (val) next.set(key, val); else next.delete(key); } setParams(next); };
  const quickPause = useMutation({ mutationFn: (r: Run) => api.action(r.runId, { action: 'pause' }), onSuccess: async detail => { await queryClient.cancelQueries({ queryKey: ['run', detail.run.runId] }); queryClient.setQueryData(['run', detail.run.runId], detail); await queryClient.invalidateQueries({ queryKey: ['runs'] }); } });
  const columns: ColumnsType<Run> = [
    { title: t('status'), dataIndex: 'status', width: 102, render: s => <StatusTag status={s}/> },
    { title: t('title'), key: 'title', width: 240, render: (_, r) => <div className={styles.title}><Link className={styles.titleLink} to={`/tasks/${encodeURIComponent(r.runId)}`}>{r.title}</Link><span className={`${styles.runId} mono`}>{r.runId.slice(0, 16)}</span></div> },
    { title: t('workflow'), key: 'workflow', width: 128, render: (_, r) => <div className={styles.cell}><span>{r.workflowName}</span><span className={styles.cellSub}>v{r.workflowVersion}</span></div> },
    { title: t('node'), key: 'node', width: 130, responsive: ['xl'], render: (_, r) => <div className={styles.cell}><span>{r.currentJob || '—'}</span><span className={styles.cellSub}>{r.currentStage ?? '—'}</span></div> },
    { title: t('repository'), key: 'repo', width: 100, responsive: ['xl'], render: (_, r) => <span className={styles.cellSub}>{t(r.repositoryMode === 'none' ? 'noRepository' : 'singleRepository')}</span> },
    { title: t('engine'), dataIndex: 'engine', width: 110, responsive: ['xl'], render: s => <span className="mono">{s ?? '—'}</span> },
    { title: t('createdAt'), dataIndex: 'createdAt', width: 114, responsive: ['lg'], render: s => <span className={styles.cellSub}>{dateTime(s, locale)}</span> },
    { title: t('duration'), key: 'duration', width: 84, render: (_, r) => <span className="mono">{duration(r.startedAt, r.finishedAt)}</span> },
    { title: t('actions'), key: 'actions', width: 100, render: (_, r) => <div className="inline">{r.allowedActions.includes('pause') && <IconButton label={t('pause')} type="text" icon={<Pause/>} loading={quickPause.isPending && quickPause.variables?.runId === r.runId} disabled={quickPause.isPending} onClick={() => quickPause.mutate(r)}/>}<IconButton label={t('detail')} type="text" icon={<ChevronRight/>} onClick={() => navigate(`/tasks/${encodeURIComponent(r.runId)}`)}/></div> },
  ];
  const empty = status || query ? <EmptyState title="noResults" description="noResultsDescription" action={<Button onClick={() => { setParams({}); setInput(''); }}>{t('clearFilters')}</Button>}/> : <EmptyState title="noTasks" description="noTasksDescription" action={<Button type="primary" onClick={() => setModal(true)}>{t('createTask')}</Button>}/>;
  return <PageLayout><PageHeader title={t('tasks')} description={t('taskDescription')} updatedAt={result.dataUpdatedAt ? dateTime(new Date(result.dataUpdatedAt).toISOString(), locale) : undefined} actions={<><IconButton label={t('refresh')} loading={result.isFetching} icon={<RefreshCcw/>} onClick={() => void result.refetch()}/><TextIconButton type="primary" icon={<Plus/>} onClick={() => setModal(true)}>{t('createTask')}</TextIconButton></>}/>
    {quickPause.error && <ErrorNotice error={quickPause.error}/>}<PagePanel><div className={styles.toolbar}><div className={styles.filters} role="group" aria-label={t('status')}>{['', ...statuses].map(s => <button key={s} className={`${styles.filter} ${status === s ? styles.filterActive : ''}`} aria-pressed={status === s} onClick={() => update({ status: s, page: '1' })}>{t(s ? s as Status : 'all')}</button>)}</div><Input className={styles.search} aria-label={t('searchTasks')} placeholder={t('searchTasks')} prefix={<Search/>} allowClear value={input} onChange={e => { setInput(e.target.value); if (!e.target.value) update({ query: '', page: '1' }); }} onPressEnter={() => update({ query: input, page: '1' })}/></div>
      {result.isPending ? <LoadingState/> : result.isError && !result.data ? <ErrorState error={result.error} retry={() => void result.refetch()}/> : !result.data?.items.length ? empty : <>{result.isError && <Alert type="warning" message={t('staleData')}/>}<div className={styles.table}><Table size="middle" columns={columns} rowKey="runId" pagination={false} dataSource={result.data.items} onRow={r => ({ onClick: e => { if (!(e.target as HTMLElement).closest('a,button')) navigate(`/tasks/${encodeURIComponent(r.runId)}`); } })}/></div><div className={styles.mobileRows}>{result.data.items.map(r => <article key={r.runId} className={styles.mobileRow}><div className={styles.mobileRowTop}><StatusTag status={r.status}/><span className={`${styles.runId} mono`}>{r.runId.slice(0, 12)}</span></div><Link className={styles.titleLink} to={`/tasks/${encodeURIComponent(r.runId)}`}>{r.title}</Link><div className="inline muted" style={{ fontSize: 12, marginTop: 8 }}><span>{r.workflowName} · v{r.workflowVersion}</span><span>{r.currentJob}</span><span>{duration(r.startedAt, r.finishedAt)}</span></div></article>)}</div></>}
      {result.data && result.data.total > 0 && <footer className={styles.footer}><span>{t('total')} {result.data.total} {t('records')}</span><Pagination aria-label={t('pagination')} size="small" current={page} pageSize={pageSize} total={result.data.total} showSizeChanger={false} onChange={p => update({ page: String(p) })}/></footer>}
    </PagePanel><CreateTask open={modal} onClose={() => setModal(false)}/>
  </PageLayout>;
}
