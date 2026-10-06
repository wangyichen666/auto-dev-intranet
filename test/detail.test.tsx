import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../src/locales';
import { ApiProvider } from '../src/services/api';
import { TaskDetail } from '../src/pages/TaskDetail';
import { Tasks } from '../src/pages/Tasks';
import { RunControls } from '../src/components/RunControls';
import type { RunDetail } from '../src/typings/api';
import type { ReactNode } from 'react';
const detail = {
  run: { runId: 'run-1', title: '测试任务', status: 'RUNNING', workflowName: 'doc', workflowVersion: '1', currentStage: 'write', currentJob: 'active-job', repositoryMode: 'none', repositoryId: null, engine: null, branch: '', workspace: null, revision: 0, createdAt: '2026-10-06T06:00:00Z', updatedAt: '2026-10-06T06:00:00Z', startedAt: '2026-10-06T06:00:00Z', finishedAt: null, allowedActions: ['pause', 'cancel'] },
  workflowGraph: { stages: [{ name: 'write', jobs: [{ name: 'failed-job', type: 'agent', allowSkip: false }, { name: 'active-job', type: 'agent', allowSkip: false }] }], loops: [] },
  attempts: [{ attemptId: 'failed', job: 'failed-job', number: 1, round: 1, status: 'FAILED', stdout: '失败节点持久化日志', stderr: '', hasSession: true, stage: 'write', engine: null, model: null, startedAt: null, finishedAt: null, errorCode: null, errorMessage: null, artifactIds: [] }, { attemptId: 'active', job: 'active-job', number: 2, round: 1, status: 'RUNNING', stdout: '活动节点持久化日志', stderr: '', hasSession: true, stage: 'write', engine: null, model: null, startedAt: null, finishedAt: null, errorCode: null, errorMessage: null, artifactIds: [] }],
  artifacts: [], events: [], operations: [], feedbackHistory: [], issueSummary: {}, stageExecutions: [], allowedActions: ['pause', 'cancel'], conversation: { available: false, reason: '没有匹配的 session' }, warnings: [], debugContext: {}, pausePoint: null,
} as RunDetail;
function mount(children: ReactNode, path = '/tasks/run-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  render(<LocaleProvider><QueryClientProvider client={client}><ApiProvider token="test"><MemoryRouter initialEntries={[path]}>{children}</MemoryRouter></ApiProvider></QueryClientProvider></LocaleProvider>);
  return client;
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); Object.defineProperty(document, 'hidden', { configurable: true, value: false }); });
describe('详情选择、恢复与查询生命周期', () => {
  it('轮询更新保留用户选择的历史失败 attempt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => detail })));
    const client = mount(<Routes><Route path="/tasks/:runId" element={<TaskDetail/>}/></Routes>);
    expect((await screen.findAllByText('活动节点持久化日志'))[0]).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: '尝试 1 · 轮次 1 失败' })[0]);
    expect(screen.getAllByText('失败节点持久化日志')[0]).toBeVisible();
    await act(async () => { client.setQueryData(['run', 'run-1'], { ...detail, attempts: [...detail.attempts, { ...detail.attempts[1], attemptId: 'new-active' }] }); });
    expect(screen.getAllByText('失败节点持久化日志')[0]).toBeVisible();
    expect(screen.getAllByRole('button', { name: '尝试 1 · 轮次 1 失败' })[0]).toHaveAttribute('aria-pressed', 'true');
  });
  it('恢复模式和反馈传递，续聊不可用原因可见', async () => {
    const fetch = vi.fn(async (_url: string, _options: RequestInit) => { void _url; void _options; return ({ ok: false, status: 409, json: async () => ({ error: { code: 'ACTION_REJECTED', message: '状态变化', requestId: 'req' } }) }); }); vi.stubGlobal('fetch', fetch);
    mount(<RunControls detail={{ ...detail, allowedActions: ['resume'] }}/>);
    const user = userEvent.setup(); await user.click(screen.getByText('恢复'));
    await waitFor(() => expect(screen.getByText('没有匹配的 session')).toBeVisible());
    expect(screen.getByRole('radio', { name: '继续原会话' })).toBeDisabled();
    await user.type(screen.getByLabelText('人工反馈'), '补充恢复流程');
    await user.click(within(screen.getByRole('dialog', { name: '恢复' })).getByRole('button', { name: /恢\s*复/ }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toMatchObject({ action: 'resume', mode: 'revise', feedback: '补充恢复流程' });
  });
  it('页面隐藏停止任务轮询，恢复可见立即刷新', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ items: [detail.run], page: 1, pageSize: 20, total: 1 }) })); vi.stubGlobal('fetch', fetch);
    mount(<Tasks/>, '/tasks'); await screen.findAllByText('测试任务'); vi.useFakeTimers(); const baseline = fetch.mock.calls.length;
    await act(async () => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(16000); });
    expect(fetch.mock.calls.length).toBe(baseline);
    await act(async () => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(10); });
    expect(fetch.mock.calls.length).toBeGreaterThan(baseline);
  });
  it('旧请求在筛选变更后取消且不能覆盖新列表', async () => {
    let resolveOld: (value: unknown) => void = () => {}; let oldSignal: AbortSignal | undefined;
    const fetch = vi.fn((url: string, options: RequestInit) => {
      if (url.includes('status=FAILED')) return Promise.resolve({ ok: true, json: async () => ({ items: [{ ...detail.run, status: 'FAILED', title: '新筛选结果' }], total: 1, page: 1, pageSize: 20 }) });
      oldSignal = options.signal ?? undefined;
      return new Promise(resolve => { resolveOld = resolve; });
    }); vi.stubGlobal('fetch', fetch); mount(<Tasks/>, '/tasks');
    await userEvent.setup().click(screen.getByRole('button', { name: '失败' }));
    expect((await screen.findAllByText('新筛选结果'))[0]).toBeVisible(); expect(oldSignal?.aborted).toBe(true);
    await act(async () => resolveOld({ ok: true, json: async () => ({ items: [{ ...detail.run, title: '旧响应结果' }], total: 1, page: 1, pageSize: 20 }) }));
    expect(screen.queryByText('旧响应结果')).not.toBeInTheDocument(); expect(screen.getAllByText('新筛选结果')[0]).toBeVisible();
  });
});
