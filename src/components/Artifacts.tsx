import { useState } from 'react';
import { Button } from 'antd';
import { Download, FileText } from '@sofa-design/icons';
import ReactMarkdown from 'react-markdown';
import { useQuery } from '@tanstack/react-query';
import type { Artifact } from '../typings/api';
import { useLocale } from '../locales';
import { useApi } from '../services/api';
import { dateTime, size } from '../services/time';
import { EmptyState, ErrorNotice, LoadingState, Metadata, TextIconButton } from './common';
import { BusinessModal } from './modals';
import styles from '../pages/detail.module.less';
export function ArtifactPreview({ runId, artifact, onClose }: { runId: string; artifact: Artifact; onClose: () => void }) {
  const api = useApi(); const { t } = useLocale();
  const content = useQuery({ queryKey: ['artifact', runId, artifact.artifactId], queryFn: ({ signal }) => api.artifact(runId, artifact.artifactId, signal) });
  return <BusinessModal open title={artifact.name} onCancel={onClose} footer={<Button onClick={onClose}>{t('close')}</Button>}>
    {content.isPending ? <LoadingState/> : content.error ? <ErrorNotice error={content.error}/> : !content.data?.previewable ? <p>{t('binary')}</p> : content.data.mime === 'text/markdown' ? <div className={styles.markdown}><ReactMarkdown skipHtml components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}>{content.data.content}</ReactMarkdown></div> : <pre className={styles.log}>{content.data.content}</pre>}
  </BusinessModal>;
}
export function Artifacts({ runId, artifacts }: { runId: string; artifacts: Artifact[] }) {
  const { t, locale } = useLocale(); const api = useApi(); const [selected, setSelected] = useState<Artifact | null>(null); const [error, setError] = useState<Error | null>(null); const [downloading, setDownloading] = useState<string | null>(null);
  const grouped = artifacts.reduce<Record<string, Artifact[]>>((acc, a) => { const key = `${a.stage ?? '—'} / ${a.job} / ${a.attemptId ?? '—'}`; (acc[key] ??= []).push(a); return acc; }, {});
  const download = async (artifact: Artifact) => { if (downloading) return; setDownloading(artifact.artifactId); setError(null); try { await api.download(runId, artifact.artifactId, artifact.name); } catch (e) { setError(e as Error); } finally { setDownloading(null); } };
  return <>{error && <ErrorNotice error={error}/>} {!artifacts.length ? <EmptyState title="noArtifacts" description="noArtifactsDescription"/> : Object.entries(grouped).map(([key, files]) => <section key={key}><p className={styles.sideHeading}>{key}</p>{files.map(a => <article key={a.artifactId} className={styles.artifact}><div className={styles.artifactName}><FileText width={18}/><strong>{a.name}</strong></div><Metadata rows={[[t('fileType'), a.kind], [t('fileSize'), size(a.size)], [t('digest'), <span className="mono">{a.sha256}</span>], [t('gitRevision'), <span className="mono">{a.gitRevision ?? '—'}</span>], [t('createdAt'), dateTime(a.createdAt, locale)]]}/><div className={styles.artifactActions}>{a.previewable && <Button size="small" onClick={() => setSelected(a)}>{t('preview')}</Button>}<TextIconButton size="small" icon={<Download/>} loading={downloading === a.artifactId} disabled={downloading !== null} onClick={() => void download(a)}>{t('download')}</TextIconButton></div></article>)}</section>)}{selected && <ArtifactPreview runId={runId} artifact={selected} onClose={() => setSelected(null)}/>}</>;
}
