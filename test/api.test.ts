import { afterEach, describe, expect, it, vi } from 'vitest';
import { APIError, Client } from '../src/services/api';
afterEach(() => vi.unstubAllGlobals());
describe('HTTP 契约与请求取消', () => {
  it('传递信号与认证，不吞掉 409', async () => { const signal = new AbortController().signal; const fetch = vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: { code: 'CONCURRENCY_CONFLICT', message: '租约冲突', requestId: 'request-1' } }) }); vi.stubGlobal('fetch', fetch); const api = new Client('test-only'); await expect(api.run('run/1', signal)).rejects.toBeInstanceOf(APIError); expect(fetch).toHaveBeenCalledWith('/api/v1/runs/run%2F1', expect.objectContaining({ signal, headers: expect.objectContaining({ Authorization: 'Bearer test-only' }) })); });
  it('请求取消保持 AbortError', async () => { vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'))); await expect(new Client('test-only').run('x')).rejects.toMatchObject({ name: 'AbortError' }); });
});
