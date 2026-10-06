import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../src/locales';
import { ApiProvider } from '../src/services/api';
import { ArtifactPreview } from '../src/components/Artifacts';
import { ValidateYaml } from '../src/pages/Workflows';
import type { Artifact } from '../src/typings/api';
import type { ReactNode } from 'react';
const artifact = { artifactId: 'a1', name: 'report.md' } as Artifact;
function mount(children: ReactNode) { render(<ConfigProvider button={{ autoInsertSpace: false }}><LocaleProvider><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ApiProvider token="test">{children}</ApiProvider></QueryClientProvider></LocaleProvider></ConfigProvider>); }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('产物与 YAML 安全呈现', () => {
  it('Markdown 忽略 HTML、外链和图片，保留正文', async () => { vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async (): Promise<unknown> => ({ name: 'report.md', mime: 'text/markdown', previewable: true, content: '# 产物标题\n<script>alert(1)</script>\n[危险链接](javascript:alert(1))\n![外部图](https://example.invalid/image.png)' }) }))); mount(<ArtifactPreview runId="run" artifact={artifact} onClose={() => {}}/>); expect(await screen.findByRole('heading', { name: '产物标题' })).toBeInTheDocument(); expect(document.querySelector('script')).toBeNull(); expect(document.querySelector('a')).toBeNull(); expect(document.querySelector('img')).toBeNull(); });
  it('JSON 以文本呈现，二进制只下载', async () => { const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async (): Promise<unknown> => ({ name: 'data.json', mime: 'application/json', previewable: true, content: '{"text":"<iframe>"}' }) })); vi.stubGlobal('fetch', fetch); mount(<ArtifactPreview runId="run" artifact={artifact} onClose={() => {}}/>); expect(await screen.findByText('{"text":"<iframe>"}')).toBeInTheDocument(); expect(document.querySelector('iframe')).toBeNull(); cleanup(); fetch.mockResolvedValue({ ok: true, status: 200, json: async (): Promise<unknown> => ({ name: 'file.bin', mime: 'application/octet-stream', previewable: false, content: '' }) }); mount(<ArtifactPreview runId="run" artifact={artifact} onClose={() => {}}/>); expect(await screen.findByText('此文件仅支持下载')).toBeInTheDocument(); });
  it('校验成功与上游逐字段错误显示，保留源码', async () => { const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async (): Promise<unknown> => ({ valid: true, name: 'doc', version: '1' }) })); vi.stubGlobal('fetch', fetch); mount(<ValidateYaml open onClose={() => {}}/>); const user = userEvent.setup(); await user.type(screen.getByLabelText('YAML 源码'), 'name: doc'); await user.click(screen.getByRole('button', { name: '严格校验' })); await waitFor(() => expect(screen.getByText('校验通过')).toBeVisible()); fetch.mockResolvedValue({ ok: false, status: 422, json: async (): Promise<unknown> => ({ error: { code: 'WORKFLOW_INVALID', message: 'YAML 校验失败', requestId: 'id', details: [{ field: 'jobs', message: '节点缺少 stage' }] } }) }); await user.clear(screen.getByLabelText('YAML 源码')); await user.type(screen.getByLabelText('YAML 源码'), 'invalid: true'); await user.click(screen.getByRole('button', { name: '严格校验' })); expect(await screen.findByText('jobs: 节点缺少 stage')).toBeInTheDocument(); expect(screen.getByLabelText('YAML 源码')).toHaveValue('invalid: true'); });
});
