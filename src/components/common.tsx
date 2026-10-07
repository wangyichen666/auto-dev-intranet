import { Alert, Button, Spin, Tooltip, type ButtonProps } from 'antd';
import { CircleAlert, FolderOpen } from '@sofa-design/icons';
import type { ReactNode } from 'react';
import { useLocale } from '../locales';
import type { MessageKey } from '../locales/zh-CN';
import type { Status } from '../typings/api';
import { APIError } from '../services/api';
import styles from './common.module.less';
export const statusTone: Record<Status, string> = { QUEUED: 'neutral', RUNNING: 'info', WAITING: 'warning', PAUSED: 'warning', SUCCEEDED: 'success', FAILED: 'danger', CANCELLED: 'neutralStrong', BLOCKED: 'danger', SKIPPED: 'neutral' };
export function StatusTag({ status }: { status: Status }) { const { t } = useLocale(); return <span data-status={status} className={`${styles.status} ${styles[statusTone[status] ?? 'neutral']}`}><span className={styles.dot}/>{t(status)}</span>; }
export function IconButton({ label, icon, ...props }: ButtonProps & { label: string; icon: ReactNode }) { return <Tooltip title={label}><Button aria-label={label} icon={icon} {...props}/></Tooltip>; }
export function TextIconButton({ children, icon, ...props }: ButtonProps) { return <Button icon={icon} {...props}>{children}</Button>; }
export function PageLayout({ children }: { children: ReactNode }) { return <div className={styles.page}>{children}</div>; }
export function PagePanel({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`${styles.panel} ${className}`}>{children}</section>; }
export function PageHeader({ title, description, actions, updatedAt }: { title: ReactNode; description?: string; actions?: ReactNode; updatedAt?: string }) { const { t } = useLocale(); return <header className={styles.header}><div><h1>{title}</h1>{description && <p className={styles.description}>{description}</p>}</div><div className={styles.commands}>{updatedAt && <span className={styles.updated}>{t('updated')} {updatedAt}</span>}{actions}</div></header>; }
export function EmptyState({ title, description, action }: { title: MessageKey; description?: MessageKey; action?: ReactNode }) { const { t } = useLocale(); return <div className={styles.state}><span className={styles.stateIcon}><FolderOpen width={24}/></span><h2>{t(title)}</h2>{description && <p>{t(description)}</p>}{action}</div>; }
export function LoadingState() { const { t } = useLocale(); return <div className={styles.state}><Spin/><p>{t('loading')}</p></div>; }
export function ErrorNotice({ error }: { error: Error }) { const { t } = useLocale(); const api = error instanceof APIError ? error : null; return <Alert className={styles.error} type="error" showIcon message={api?.status === 503 ? t('unavailable') : t('apiError')} description={<div className={styles.errorDetails}><p>{api ? `${api.code} · ${api.message}` : error.message}</p>{api?.details && Array.isArray(api.details) && api.details.map((d, i) => <p key={`${d.field}-${i}`}>{d.field}: {d.message}</p>)}{api?.requestId && <span className="mono">{t('requestId')}: {api.requestId}</span>}</div>}/>; }
export function ErrorState({ error, retry }: { error: Error; retry: () => void }) { const { t } = useLocale(); const unavailable = error instanceof APIError && error.status === 503; return <div className={styles.state}><span className={styles.stateIcon}><CircleAlert width={24}/></span><h2>{t(unavailable ? 'unavailable' : 'failedLoad')}</h2><p>{t(unavailable ? 'unavailableDescription' : 'retryLoad')}</p><ErrorNotice error={error}/><Button onClick={retry}>{t('retryLoad')}</Button></div>; }
export function Metadata({ rows }: { rows: [string, ReactNode][] }) { return <dl className={styles.metadata}>{rows.map(([key, val], index) => <div key={`${key}-${index}`} style={{ display: 'contents' }}><dt>{key}</dt><dd>{val ?? '—'}</dd></div>)}</dl>; }
