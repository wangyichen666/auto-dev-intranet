import { useState } from 'react';
import { Alert, Tabs } from 'antd';
import { ArrowLeft, RefreshCcw } from '@sofa-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Artifacts } from '../components/Artifacts';
import { RunControls } from '../components/RunControls';
import { EmptyState, ErrorState, IconButton, LoadingState, Metadata, PageHeader, PageLayout, PagePanel, StatusTag } from '../components/common';
import { useLocale } from '../locales';
import { useApi } from '../services/api';
import { isActive, useVisible } from '../services/polling';
import { dateTime, duration } from '../services/time';
import type { Attempt, RunDetail } from '../typings/api';
import styles from './detail.module.less';
export function defaultAttempt(detail: RunDetail): Attempt | undefined {
  const jobs = new Set(detail.workflowGraph?.stages.flatMap(stage => stage.jobs.map(job => job.name)) ?? []);
  const visible = detail.attempts.filter(attempt => jobs.has(attempt.job));
  const candidates = visible.length ? visible : detail.attempts;
  return [...candidates].reverse().find(a => a.status === 'RUNNING' || a.status === 'WAITING') ?? [...candidates].reverse().find(a => a.status === 'FAILED' || a.status === 'BLOCKED') ?? candidates.at(-1);
}
function Execution({ detail, selected, onSelect }: { detail: RunDetail; selected?: Attempt; onSelect: (id: string) => void }) {
  const { t, locale } = useLocale();
  return <PagePanel className={styles.executionPanel}><div className={styles.panelTitle}><h2>{t('execution')}</h2><span className="muted">{detail.workflowGraph.stages.length} {t('stages')}</span></div><div className={styles.process}><div className={styles.rail}>
    {!detail.workflowGraph.stages.length && <p className="muted">{t('noGraph')}</p>}
    {detail.workflowGraph.stages.map((stage, index) => <section key={stage.name} className={styles.stage}><h3 className={styles.stageHeading}><span className={styles.stageNumber}>{String(index + 1).padStart(2, '0')}</span>{stage.name}</h3>{stage.jobs.map(job => <div className={styles.job} key={job.name}><div className={styles.jobHeading}>{job.name}</div>{detail.attempts.filter(a => a.job === job.name).map(a => <button type="button" key={a.attemptId} className={`${styles.attemptButton} ${selected?.attemptId === a.attemptId ? styles.selected : ''}`} aria-pressed={selected?.attemptId === a.attemptId} onClick={() => onSelect(a.attemptId)}><span className={styles.attemptText}>{t('attempt')} {a.number} · {t('round')} {a.round}</span><StatusTag status={a.status}/></button>)}{!detail.attempts.some(a => a.job === job.name) && <span className={styles.attemptText}>{t('pending')}</span>}</div>)}</section>)}
    </div><div className={styles.inspect}>{!selected ? <EmptyState title="noAttempts" description="waitForDaemon"/> : <><div className={styles.inspectHeader}><h3>{selected.job}</h3><StatusTag status={selected.status}/></div><Metadata rows={[[t('attempt'), `${selected.number} · ${t('round')} ${selected.round}`], [t('engine'), selected.engine ?? '—'], [t('model'), selected.model ?? '—'], [t('session'), t(selected.hasSession ? 'hasSession' : 'noSession')], [t('start'), dateTime(selected.startedAt, locale)], [t('finish'), dateTime(selected.finishedAt, locale)], [t('duration'), duration(selected.startedAt, selected.finishedAt)]]}/>
    {selected.errorCode && <Alert style={{ marginTop: 20 }} type="error" message={selected.errorCode} description={selected.errorMessage}/>}
    <h3 className={styles.logLabel}>{t('logs')}</h3>{!selected.stdout && !selected.stderr ? <p className="muted">{t('noOutput')}</p> : <>{selected.stdout && <><p className={styles.sideHeading}>{t('stdout')}</p><pre className={styles.log}>{selected.stdout}</pre></>}{selected.stderr && <><p className={styles.sideHeading}>{t('stderr')}</p><pre className={styles.log}>{selected.stderr}</pre></>}</>}
    </>}</div></div></PagePanel>;
}
function Information({ detail }: { detail: RunDetail }) { const { t, locale } = useLocale(); return <>
  <section className={styles.section}><h3>{t('runInfo')}</h3><Metadata rows={[[t('runId'), <span className="mono">{detail.run.runId}</span>], [t('version'), detail.run.workflowVersion], [t('revision'), detail.run.revision], [t('createdAt'), dateTime(detail.run.createdAt, locale)], [t('start'), dateTime(detail.run.startedAt, locale)], [t('finish'), dateTime(detail.run.finishedAt, locale)], [t('branch'), detail.run.branch || '—'], [t('managedWorkspace'), detail.run.workspace ?? '—']]}/></section>
  {typeof detail.issueSummary.body === 'string' && <section className={styles.section}><h3>{t('taskBody')}</h3><pre>{detail.issueSummary.body}</pre></section>}
  {detail.pausePoint && <section className={styles.section}><h3>{t('pausePoint')}</h3><pre>{JSON.stringify(detail.pausePoint, null, 2)}</pre></section>}
  <section className={styles.section}><h3>{t('feedbackHistory')}</h3>{detail.feedbackHistory.length ? detail.feedbackHistory.map((f, i) => <pre key={i}>{JSON.stringify(f, null, 2)}</pre>) : <p className="muted">{t('noData')}</p>}</section>
  <section className={styles.section}><h3>{t('operations')}</h3>{detail.operations.length ? <pre>{JSON.stringify(detail.operations, null, 2)}</pre> : <p className="muted">{t('noData')}</p>}</section>
  <details className={styles.section}><summary>{t('debugContext')}</summary><pre>{JSON.stringify(detail.debugContext, null, 2)}</pre></details></>; }
function Events({ detail }: { detail: RunDetail }) { const { locale } = useLocale(); const unique = [...new Map(detail.events.map(e => [e.eventId, e])).values()]; return unique.length ? <div>{unique.map(e => <article key={e.eventId} className={styles.event}><p className={styles.eventType}>{e.type}</p><p className={styles.eventDate}>{dateTime(e.createdAt, locale)} · {e.step ?? '—'}</p><pre>{JSON.stringify(e.payload, null, 2)}</pre></article>)}</div> : <EmptyState title="noEvents" description="noData"/>; }
export function TaskDetail() {
  const { runId = '' } = useParams(); const { t } = useLocale(); const api = useApi(); const visible = useVisible(); const [selection, setSelection] = useState<{ runId: string; id: string } | null>(null);
  const result = useQuery({ queryKey: ['run', runId], queryFn: ({ signal }) => api.run(runId, signal), refetchInterval: q => visible && q.state.data && (isActive(q.state.data.run.status) || q.state.data.run.status === 'PAUSED') ? 3000 : false, refetchIntervalInBackground: false });
  if (result.isPending) return <PageLayout><LoadingState/></PageLayout>;
  if (!result.data) return <PageLayout><ErrorState error={result.error ?? new Error(t('failedLoad'))} retry={() => void result.refetch()}/></PageLayout>;
  const detail = result.data; const run = detail.run;
  const selected = selection?.runId === runId ? detail.attempts.find(a => a.attemptId === selection.id) : defaultAttempt(detail);
  const execution = <Execution detail={detail} selected={selected} onSelect={id => setSelection({ runId, id })}/>;
  const tabs = [{ key: 'artifacts', label: t('artifacts'), children: <Artifacts runId={runId} artifacts={detail.artifacts}/> }, { key: 'info', label: t('runInfo'), children: <Information detail={detail}/> }, { key: 'events', label: t('events'), children: <Events detail={detail}/> }];
  return <PageLayout><Link className={styles.back} to="/tasks"><ArrowLeft width={14}/>{t('back')}</Link><PageHeader title={<div className={styles.titleLine}><span>{run.title}</span><StatusTag status={run.status}/></div>} description={`${run.runId} · ${run.workflowName} v${run.workflowVersion}`} actions={<><IconButton label={t('refresh')} loading={result.isFetching} icon={<RefreshCcw/>} onClick={() => void result.refetch()}/><RunControls detail={detail}/></>}/>
  {result.isError && <Alert type="warning" message={t('staleData')}/>} {detail.warnings.length > 0 && <Alert type="warning" message={t('definitionWarning')}/>}
  <div className={styles.context}><span><label>{t('node')}</label>{run.currentStage ? `${run.currentStage} / ` : ''}{run.currentJob || '—'}</span><span><label>{t('repository')}</label>{t(run.repositoryMode === 'none' ? 'noRepository' : 'singleRepository')}</span><span><label>{t('branch')}</label>{run.branch || '—'}</span><span><label>{t('duration')}</label><span className="mono">{duration(run.startedAt, run.finishedAt)}</span></span><span className={styles.long}><label>{t('managedWorkspace')}</label><span className="mono">{run.workspace ?? '—'}</span></span></div>
  <div className={styles.workspace}>{execution}<PagePanel className={styles.side}><Tabs items={tabs}/></PagePanel></div><div className={styles.mobileTabs}><Tabs items={[{ key: 'execution', label: t('execution'), children: execution }, ...tabs]}/></div>
  </PageLayout>;
}
