import { useRef, useState } from 'react';
import { Button, Input, Radio } from 'antd';
import { Pause, Play, RefreshCcw, X, ChevronRight } from '@sofa-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useLocale } from '../locales';
import { useApi } from '../services/api';
import type { Action, RunDetail } from '../typings/api';
import type { MessageKey } from '../locales/zh-CN';
import { BusinessModal, DangerConfirm, ErrorNotice, TextIconButton } from './common';
const actionIcons = { pause: <Pause/>, resume: <Play/>, retry: <RefreshCcw/>, cancel: <X/>, skip: <ChevronRight/> };
const actionLabel: Record<Action, MessageKey> = { pause: 'pause', resume: 'resume', retry: 'retry', skip: 'skip', cancel: 'cancelRun' };
export function RunControls({ detail }: { detail: RunDetail }) {
  const { t } = useLocale(); const api = useApi(); const client = useQueryClient(); const navigate = useNavigate();
  const [selected, setSelected] = useState<Action | null>(null); const [mode, setMode] = useState<'revise' | 'continue_conversation'>('revise'); const [feedback, setFeedback] = useState(''); const lock = useRef(false);
  const mutation = useMutation({ mutationFn: (action: Action) => api.action(detail.run.runId, { action, mode: action === 'resume' || action === 'retry' ? mode : 'revise', feedback: ['resume', 'retry', 'skip'].includes(action) && feedback ? feedback : undefined }), onSuccess: async data => { await client.cancelQueries({ queryKey: ['run', detail.run.runId] }); client.setQueryData(['run', data.run.runId], data); await client.invalidateQueries({ queryKey: ['runs'] }); setSelected(null); setFeedback(''); if (data.run.runId !== detail.run.runId) navigate(`/tasks/${encodeURIComponent(data.run.runId)}`); } });
  const execute = async (action: Action) => { if (lock.current || !detail.allowedActions.includes(action)) return; lock.current = true; try { await mutation.mutateAsync(action); } catch { await client.invalidateQueries({ queryKey: ['run', detail.run.runId] }); } finally { lock.current = false; } };
  const select = (action: Action) => { mutation.reset(); setMode('revise'); setSelected(action); if (action === 'pause') void execute(action); };
  const dismiss = () => { if (!mutation.isPending) { setSelected(null); mutation.reset(); } };
  return <>
    <div className="inline">{detail.allowedActions.map(action => <TextIconButton key={action} icon={actionIcons[action]} danger={action === 'cancel'} type={action === 'resume' || action === 'retry' ? 'primary' : 'default'} loading={mutation.isPending && selected === action} disabled={mutation.isPending} onClick={() => select(action)}>{t(actionLabel[action])}</TextIconButton>)}</div>
    {selected === 'pause' && mutation.error && <ErrorNotice error={mutation.error}/>}
    <DangerConfirm open={selected === 'cancel'} title={t('cancelTitle')} description={t('cancelDescription')} loading={mutation.isPending} error={mutation.error} onCancel={dismiss} onConfirm={() => void execute('cancel')}/>
    <BusinessModal open={selected !== null && !['cancel', 'pause'].includes(selected)} title={selected ? t(actionLabel[selected]) : t('actionTitle')} onCancel={dismiss} closable={!mutation.isPending} footer={<><Button onClick={dismiss} disabled={mutation.isPending}>{t('cancel')}</Button><Button type="primary" loading={mutation.isPending} disabled={!selected || !detail.allowedActions.includes(selected) || (mode === 'continue_conversation' && !detail.conversation.available)} onClick={() => selected && void execute(selected)}>{selected ? t(actionLabel[selected]) : t('actionTitle')}</Button></>}>
      {selected !== null && !["cancel", "pause"].includes(selected) && mutation.error && <ErrorNotice error={mutation.error}/>}
      <div className="stack">{selected !== 'skip' && <><label>{t('mode')}</label><Radio.Group value={mode} onChange={e => setMode(e.target.value)} disabled={mutation.isPending}><Radio value="revise">{t('revise')}</Radio><Radio value="continue_conversation" disabled={!detail.conversation.available}>{t('continueConversation')}</Radio></Radio.Group>{!detail.conversation.available && <p className="muted">{detail.conversation.reason}</p>}</>}
      <label htmlFor="action-feedback">{t('feedback')}</label><Input.TextArea id="action-feedback" rows={4} maxLength={20000} showCount value={feedback} onChange={e => setFeedback(e.target.value)} placeholder={t('feedbackPlaceholder')} disabled={mutation.isPending}/></div>
    </BusinessModal>
  </>;
}
