import { useRef } from 'react';
import { Button, Form, Input, Select } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../services/api';
import { useLocale } from '../locales';
import type { CreateCommand } from '../typings/api';
import { BusinessModal, ErrorNotice } from './common';
export function CreateTask({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useApi(); const { t } = useLocale(); const navigate = useNavigate(); const client = useQueryClient();
  const [form] = Form.useForm<CreateCommand>(); const locked = useRef(false);
  const workflows = useQuery({ queryKey: ['workflows'], queryFn: ({ signal }) => api.workflows(signal), enabled: open });
  const repositories = useQuery({ queryKey: ['repositories'], queryFn: ({ signal }) => api.repositories(signal), enabled: open });
  const selected = Form.useWatch('workflowTemplateId', form);
  const template = workflows.data?.find(w => w.templateId === selected);
  const create = useMutation({ mutationFn: (command: CreateCommand) => api.create(command), onSuccess: async detail => { await client.invalidateQueries({ queryKey: ['runs'] }); client.setQueryData(['run', detail.run.runId], detail); form.resetFields(); onClose(); navigate(`/tasks/${encodeURIComponent(detail.run.runId)}`); } });
  const submit = async () => { if (locked.current) return; locked.current = true; try { const values = await form.validateFields(); await create.mutateAsync({ ...values, repositoryId: values.repositoryId ?? null }); } catch { /* 表单与 API 错误由各自组件展示，保留输入 */ } finally { locked.current = false; } };
  return <BusinessModal title={t('createTask')} open={open} onCancel={onClose} closable={!create.isPending} footer={<><Button disabled={create.isPending} onClick={onClose}>{t('cancel')}</Button><Button type="primary" loading={create.isPending} disabled={create.isPending || workflows.isError || repositories.isError || workflows.isPending || repositories.isPending} onClick={() => void submit()}>{t('createAndQueue')}</Button></>}>
    <p className="muted" style={{ marginBottom: 20 }}>{t('taskHint')}</p>
    {workflows.error && <ErrorNotice error={workflows.error}/>} {repositories.error && <ErrorNotice error={repositories.error}/>} {create.error && <ErrorNotice error={create.error}/>}
    <Form form={form} layout="vertical" requiredMark={false}>
      <Form.Item name="task" label={t('task')} rules={[{ required: true, whitespace: true, message: t('requiredTask') }]}><Input.TextArea rows={4} maxLength={20000} showCount placeholder={t('taskPlaceholder')} disabled={create.isPending}/></Form.Item>
      <Form.Item name="workflowTemplateId" label={t('template')} rules={[{ required: true, message: t('requiredWorkflow') }]} extra={template && <span>{template.description} · {t('version')} {template.version} · {template.stageCount} {t('stages')} / {template.jobCount} {t('jobs')}</span>}><Select placeholder={t('chooseTemplate')} loading={workflows.isPending} disabled={create.isPending} options={workflows.data?.map(w => ({ value: w.templateId, label: `${w.name} · v${w.version} (${w.templateId})`, disabled: !w.valid }))}/></Form.Item>
      <Form.Item name="repositoryId" label={t('optionalRepository')} extra={t('repositoryHint')}><Select allowClear placeholder={t('noRepository')} loading={repositories.isPending} disabled={create.isPending} options={repositories.data?.map(r => ({ value: r.repositoryId, label: r.name }))}/></Form.Item>
    </Form>
  </BusinessModal>;
}
