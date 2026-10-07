import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ExecutionOutput } from '../src/components/ExecutionOutput';
import { LocaleProvider } from '../src/locales';
import { readClaudeOutput } from '../src/services/output';
import type { Attempt } from '../src/typings/api';

const stream = (...events: unknown[]) => events.map(event => JSON.stringify(event)).join('\n');
const initialization = { type: 'system', subtype: 'init', model: 'test-model' };
const reply = { type: 'assistant', message: { content: [{ type: 'text', text: '文档已生成，请查看 report.md。' }, { type: 'tool_use', name: 'Write', input: { path: 'report.md' } }] } };
function mount(stdout: string, engine = 'claude-cli', stderr = '') {
  render(<LocaleProvider><ExecutionOutput attempt={{ stdout, stderr, engine } as Attempt}/></LocaleProvider>);
}
afterEach(cleanup);

describe('Claude 持久化输出阅读', () => {
  it('按原始顺序展示完整的会话、回复、工具与结果事件', () => {
    const source = stream(initialization, reply, { type: 'result', result: '完成' });
    expect(readClaudeOutput(source)).toEqual({ recognized: true, incomplete: false, entries: [
      { kind: 'sessionStarted', text: 'test-model' }, { kind: 'modelReply', text: '文档已生成，请查看 report.md。' }, { kind: 'toolInvocation', text: 'Write' }, { kind: 'modelResult', text: '完成' },
    ] });
  });
  it('截断尾部不猜测模型回复，也不丢弃完整记录', () => {
    const source = stream(initialization) + '\n{"type":"assistant","message":{"content":';
    expect(readClaudeOutput(source)).toMatchObject({ recognized: true, incomplete: true, entries: [{ kind: 'sessionStarted', text: 'test-model' }] });
    mount(source);
    expect(screen.getByText('当前摘要未包含模型文字回复，可查看产物或原始记录。')).toBeVisible();
    expect(screen.queryByText('模型回复')).not.toBeInTheDocument();
  });
  it('原始摘要折叠保留，包含不可识别或不完整片段', async () => {
    const source = stream(initialization, { type: 'future_event', value: '未来格式' }) + '\n{"partial":';
    mount(source);
    const summary = screen.getByText('原始输出摘要');
    const raw = summary.closest('details');
    expect(raw).not.toHaveAttribute('open');
    expect(raw).toHaveTextContent(source.replaceAll('\n', ' '));
    await userEvent.setup().click(summary);
    expect(raw).toHaveAttribute('open');
  });
  it('模型输出包含 HTML 时只显示文字，绝不创建脚本、图片或链接', () => {
    const text = '<script>alert(1)</script><img src="https://example.invalid/x"><a href="javascript:alert(1)">跳转</a>';
    mount(stream({ type: 'assistant', message: { content: [{ type: 'text', text }] } }));
    expect(screen.getByText(text, { exact: true })).toBeVisible();
    expect(document.querySelector('script,img,a')).toBeNull();
  });
  it('普通文本、未知 JSON 和其他引擎的 JSON 继续原样展示', () => {
    const source = stream(initialization);
    mount(source, 'codex-cli');
    expect(screen.getByText(source)).toBeVisible();
    expect(screen.queryByText('会话初始化')).not.toBeInTheDocument();
    expect(readClaudeOutput('普通文字\n{"hello":"world"}').recognized).toBe(false);
  });
  it('错误输出保留，完全无输出时显示明确空态', () => {
    mount('', 'claude-cli', '进程退出失败');
    expect(screen.getByText('进程退出失败')).toBeVisible();
    expect(screen.getByText('标准错误')).toBeVisible();
    cleanup(); mount('');
    expect(screen.getByText('此节点尚无持久化输出。')).toBeVisible();
    expect(screen.queryByText('原始输出摘要')).not.toBeInTheDocument();
  });
});
