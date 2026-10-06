import type { components } from './generated';
type Schema = components['schemas'];
// DTO 默认字段在响应中始终序列化；OpenAPI 对输入默认字段标为可选。
type ResponseDTO<K extends keyof Schema> = Required<Schema[K]>;
export type Status = Schema['Status'] | 'BLOCKED' | 'SKIPPED';
export type Action = Schema['RunActionCommand']['action'];
export type Run = ResponseDTO<'RunSummary'>;
export type Job = Schema['Job'];
export type Graph = ResponseDTO<'WorkflowGraph'>;
export type Attempt = ResponseDTO<'Attempt'>;
export type Artifact = ResponseDTO<'Artifact'>;
export type RunEvent = ResponseDTO<'Event'>;
export type RunDetail = Omit<ResponseDTO<'RunDetail'>, 'run' | 'workflowGraph' | 'attempts' | 'artifacts' | 'events' | 'conversation'> & { run: Run; workflowGraph: Graph; attempts: Attempt[]; artifacts: Artifact[]; events: RunEvent[]; conversation: { available?: boolean; reason?: string } };
export interface Page<T> { items: T[]; page: number; pageSize: number; total: number }
export type Workflow = Omit<ResponseDTO<'WorkflowSummary'>, 'errors'> & { errors: { field: string; message: string }[] };
export type WorkflowDetail = Omit<ResponseDTO<'WorkflowDetail'>, 'graph' | 'errors'> & { graph: Graph; errors: { field: string; message: string }[] };
export type Validation = Omit<ResponseDTO<'WorkflowValidation'>, 'graph'> & { graph: Graph | null };
export type Repository = ResponseDTO<'RepositorySummary'>;
export type Health = Omit<ResponseDTO<'SystemHealth'>, 'diagnostics'> & { diagnostics: { code: string; message: string }[] };
export type ArtifactContent = ResponseDTO<'ArtifactContent'>;
export type CreateCommand = ResponseDTO<'CreateRunCommand'>;
export type ActionCommand = Omit<Schema['RunActionCommand'], 'mode'> & { mode?: 'revise' | 'continue_conversation' };
