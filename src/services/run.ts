import type { Attempt, Run, RunDetail } from '../typings/api';

export function defaultAttempt(detail: RunDetail): Attempt | undefined {
  const jobs = new Set(detail.workflowGraph?.stages.flatMap(stage => stage.jobs.map(job => job.name)) ?? []);
  const visible = detail.attempts.filter(attempt => jobs.has(attempt.job));
  const candidates = visible.length ? visible : detail.attempts;
  return [...candidates].reverse().find(a => a.status === 'RUNNING' || a.status === 'WAITING') ?? [...candidates].reverse().find(a => a.status === 'FAILED' || a.status === 'BLOCKED') ?? candidates.at(-1);
}

// 展示投影不会改写 DTO，内部收尾节点只在已完成任务中转换为业务文案。
export function runNode(run: Pick<Run, 'status' | 'currentJob' | 'currentStage'>, finished: string) {
  if (run.status === 'SUCCEEDED' && run.currentJob === '__complete') return finished;
  return [run.currentStage, run.currentJob].filter(Boolean).join(' / ') || '—';
}
