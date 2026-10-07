import { render, screen } from '@testing-library/react';
import { StatusTag, statusTone } from '../src/components/common';
import { LocaleProvider } from '../src/locales';
import { enUS } from '../src/locales/en-US';
import { zhCN } from '../src/locales/zh-CN';
import { duration } from '../src/services/time';
import { defaultAttempt } from '../src/services/run';
import type { RunDetail, Attempt } from '../src/typings/api';
import { describe, it, expect } from 'vitest';
describe('共享状态与事实字段', () => {
  it('原始状态保持不变，完整映射颜色与中英文', () => { render(<LocaleProvider><StatusTag status="BLOCKED"/></LocaleProvider>); expect(screen.getByText('已阻塞')).toHaveAttribute('data-status', 'BLOCKED'); expect(statusTone.BLOCKED).toBe('danger'); expect(Object.keys(enUS)).toEqual(Object.keys(zhCN)); });
  it('持续时间处理未开始、未来和跨小时', () => { expect(duration(null, null)).toBe('—'); expect(duration('2026-10-06T01:00:00Z', '2026-10-06T02:30:00Z')).toBe('1h 30m'); expect(duration('2026-10-06T02:00:00Z', '2026-10-06T01:00:00Z')).toBe('0s'); });
  it('活动节点优先，其次失败节点，再选最新记录', () => { const failed = { attemptId: 'failed', status: 'FAILED' } as Attempt; const active = { attemptId: 'active', status: 'RUNNING' } as Attempt; expect(defaultAttempt({ attempts: [failed, active] } as RunDetail)?.attemptId).toBe('active'); expect(defaultAttempt({ attempts: [failed] } as RunDetail)?.attemptId).toBe('failed'); });
  it('真实工作流的内部完成记录不会盖住可见节点的模型输出', () => {
    const write = { attemptId: 'write-1', job: 'write', status: 'SUCCEEDED', engine: 'claude-cli', stdout: '完成' } as Attempt;
    const complete = { attemptId: 'complete-1', job: '__complete', status: 'SUCCEEDED' } as Attempt;
    const detail = { workflowGraph: { stages: [{ name: 'write', jobs: [{ name: 'write' }] }] }, attempts: [write, complete] } as RunDetail;
    expect(defaultAttempt(detail)).toBe(write);
    expect(defaultAttempt({ ...detail, workflowGraph: { stages: [], loops: [] } })).toBe(complete);
  });
});
