import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ActionCommand, ArtifactContent, CreateCommand, Health, Page, Repository, Run, RunDetail, Validation, Workflow, WorkflowDetail } from '../typings/api';
export class APIError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId: string, public details: { field: string; message: string }[] | null = null) { super(message); }
}
export class Client {
  constructor(private token: string) {}
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`/api/v1${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers, Authorization: `Bearer ${this.token}` } });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: { code: 'HTTP_ERROR', message: response.statusText } }));
      throw new APIError(response.status, body.error.code, body.error.message, body.error.requestId ?? '', body.error.details);
    }
    return response.json() as Promise<T>;
  }
  runs(params: URLSearchParams, signal?: AbortSignal) { return this.request<Page<Run>>(`/runs?${params}`, { signal }); }
  run(id: string, signal?: AbortSignal) { return this.request<RunDetail>(`/runs/${encodeURIComponent(id)}`, { signal }); }
  create(command: CreateCommand) { return this.request<RunDetail>('/runs', { method: 'POST', body: JSON.stringify(command) }); }
  action(id: string, command: ActionCommand) { return this.request<RunDetail>(`/runs/${encodeURIComponent(id)}/actions`, { method: 'POST', body: JSON.stringify(command) }); }
  workflows(signal?: AbortSignal) { return this.request<Workflow[]>('/workflows', { signal }); }
  workflow(id: string, signal?: AbortSignal) { return this.request<WorkflowDetail>(`/workflows/${encodeURIComponent(id)}`, { signal }); }
  repositories(signal?: AbortSignal) { return this.request<Repository[]>('/repositories', { signal }); }
  health(signal?: AbortSignal) { return this.request<Health>('/system', { signal }); }
  validate(source: string) { return this.request<Validation>('/workflows/validate', { method: 'POST', body: JSON.stringify({ source }) }); }
  artifact(runId: string, artifactId: string, signal?: AbortSignal) { return this.request<ArtifactContent>(`/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}/content`, { signal }); }
  async download(runId: string, artifactId: string, name: string) {
    const response = await fetch(`/api/v1/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}/download`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!response.ok) { const body = await response.json(); throw new APIError(response.status, body.error.code, body.error.message, body.error.requestId); }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
const ApiContext = createContext<Client | null>(null);
export function ApiProvider({ token, children }: { token: string; children: ReactNode }) {
  const client = useMemo(() => new Client(token), [token]);
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}
export function useApi() { const api = useContext(ApiContext); if (!api) throw new Error('API context missing'); return api; }
