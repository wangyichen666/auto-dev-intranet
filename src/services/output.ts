export type OutputKind = 'sessionPreparing' | 'sessionHookResult' | 'sessionStarted' | 'modelReply' | 'toolInvocation' | 'modelResult';
export type OutputEntry = { kind: OutputKind; text: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// 只提取已保存的完整 Claude 事件。原始摘要始终保留，不从截断 JSON 猜测结果。
export function readClaudeOutput(source: string) {
  const entries: OutputEntry[] = [];
  let recognized = false;
  let incomplete = false;
  for (const line of source.split('\n').filter(line => line.trim())) {
    let event: unknown;
    try { event = JSON.parse(line); } catch { incomplete = true; continue; }
    if (!record(event)) { incomplete = true; continue; }
    if (event.type === 'system' && ['init', 'hook_started', 'hook_response'].includes(String(event.subtype))) {
      recognized = true;
      const kind = event.subtype === 'init' ? 'sessionStarted' : event.subtype === 'hook_started' ? 'sessionPreparing' : 'sessionHookResult';
      const text = event.subtype === 'init' ? event.model : event.hook_name;
      entries.push({ kind, text: typeof text === 'string' ? text : '' });
    } else if (event.type === 'assistant' && record(event.message) && Array.isArray(event.message.content)) {
      recognized = true;
      for (const block of event.message.content) {
        if (!record(block)) continue;
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) entries.push({ kind: 'modelReply', text: block.text });
        else if (block.type === 'tool_use' && typeof block.name === 'string') entries.push({ kind: 'toolInvocation', text: block.name });
      }
    } else if (event.type === 'result' && typeof event.result === 'string') {
      recognized = true;
      entries.push({ kind: 'modelResult', text: event.result });
    } else incomplete = true;
  }
  return { recognized, incomplete, entries };
}
