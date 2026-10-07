# HTTP API

统一前缀 `/api/v1`，同源默认，所有接口（包含 health 与 OpenAPI）要求 `Authorization: Bearer <token>`。时间统一 ISO 8601 UTC，前端本地时区呈现。鉴权和大小边界先于 Gateway。

| 方法 | 路径 | 响应 |
| --- | --- | --- |
| GET | `/health`、`/system` | SystemHealth；BFF 正常而上游不可用时 HTTP 200 + upstreamAvailable=false + 诊断 |
| GET | `/runs` | Page&lt;RunSummary&gt; |
| POST | `/runs` | 201 RunDetail，只入队 |
| GET | `/runs/{runId}` | RunDetail |
| POST | `/runs/{runId}/actions` | RunDetail，retry 旧 Issue 任务可能返回新 run ID |
| GET | `/runs/{runId}/events` | 领域事件，按时间及 event ID 排序、去重 |
| GET | `/runs/{runId}/artifacts/{artifactId}/content` | ArtifactContent；只允许安全文件；二进制 content=null |
| GET | `/runs/{runId}/artifacts/{artifactId}/download` | application/octet-stream + attachment；认证 fetch 下载 |
| GET | `/workflows` | WorkflowSummary[] |
| GET | `/workflows/{templateId}` | WorkflowDetail，脱敏源码与结构 |
| POST | `/workflows/validate` | WorkflowValidation，失败 422；不执行、保存或覆盖模板 |
| GET | `/repositories` | RepositorySummary[]，只读安全字段 |
| GET | `/openapi.json` | 本 BFF 自动生成的 OpenAPI |

离线契约提交在 `config/openapi.json`；TypeScript 类型在 `src/typings/generated.ts`。

## 查询与分页

`status` 可选，精确原始运行状态；`query` 最多 200 字符，匹配 run ID、标题、工作流（不区分大小写）；`page` 默认 1，范围 1–10000；`pageSize` 默认 20，范围 1–100。按 `(createdAt, runId)` 倒序稳定排列，超出最后一页返回空 items，total 仍是匹配条数。记录总量超过 10000 时返回 503 `LIST_CAPACITY_EXCEEDED`。

```json
{"items": [], "page": 1, "pageSize": 20, "total": 0}
```

## 创建与控制

```json
{"task": "补充 API 文档与测试", "workflowTemplateId": "document.yaml", "repositoryId": null}
```

task 去除首尾空白，长度 1–20000；模板必须来自服务器列表。repositoryId 为 null 表示无仓，非 null 必须是配置中的完整 ID（不接受模糊提示）。

```json
{"action": "resume", "mode": "revise", "feedback": "补充异常恢复流程"}
```

action：pause/resume/retry/cancel/skip；mode 默认 revise，另支持 continue_conversation；feedback 最多 20000 字符。允许操作由详情 `allowedActions` 投影，`conversation.available/reason` 提供会话继续的真实前置条件；租约、活进程、revision 等冲突仍由上游最终判定。前端不得静默将续聊改为 revise。

RunDetail 包含 run、issueSummary、workflowGraph、stageExecutions、attempts、artifacts、operations、events、pausePoint、feedbackHistory、allowedActions、conversation、debugContext、warnings。调试上下文递归限制深度/条数，并限制 32 KiB。核心字段不依赖前端解析 context。

## 内容上限

JSON 请求最大 1 MiB + 64 KiB；解码后的 YAML UTF-8 最大 1 MiB。模板文件最大 1 MiB、仅直属 YAML 文件。产物文本预览最大 256 KiB，下载最大 20 MiB。日志从持久化 execution facts 读取，每个 stdout/stderr 最多 2048 字符。前端仅对 `claude-cli` 的完整 JSON 行提取会话、文字回复、工具名称和结果；原始摘要完整保留，不从截断片段推断结果或执行状态。所有提取字段通过 React 作为文字渲染，其他引擎与未知格式保持原样。本轮未更改 HTTP DTO。内容不伪装流式输出。二进制仅下载；文本输出统一脱敏。

## 统一错误

```json
{"error": {"code": "CONCURRENCY_CONFLICT", "message": "当前原子动作仍持有租约，请等待安全边界", "details": null, "requestId": "..."}}
```

| HTTP | 机器码 | 含义 |
| --- | --- | --- |
| 400 | INVALID_ARGUMENT、INVALID_TEMPLATE_ID、UNKNOWN_REPOSITORY | 输入类型/范围、模板 ID 或仓库无效 |
| 401 | UNAUTHORIZED | 缺少/错误 token，或服务器未设置 token |
| 403 | UNSAFE_PATH、UNSAFE_FILE | 文件越界、符号链接、非普通文件或无法安全访问 |
| 404 | NOT_FOUND | 未知任务、模板、产物、清理后工作区、API/资源不存在 |
| 409 | CONCURRENCY_CONFLICT、ACTION_REJECTED、SESSION_LOST | 上游租约/revision/状态或续聊拒绝 |
| 413 | REQUEST_TOO_LARGE、WORKFLOW_TOO_LARGE、ARTIFACT_TOO_LARGE | 请求或内容超过上限 |
| 422 | WORKFLOW_INVALID | YAML 严格校验或选择的模板无效，details 含字段及安全消息 |
| 500 | INTERNAL_ERROR | 未分类异常，仅返回请求 ID 与通用信息 |
| 503 | UPSTREAM_NOT_CONFIGURED、CONFIGURATION_INVALID、UPSTREAM_UNAVAILABLE、CAPABILITY_NOT_CONFIGURED、WORKFLOW_DIRECTORY_UNAVAILABLE、LIST_CAPACITY_EXCEEDED | 上游、配置、能力、模板目录或首批查询容量不可用 |

所有错误带请求 ID；不返回 traceback、完整命令、凭据或宿主绝对路径。Bearer 首批没有角色差异，因此认证失败使用 401；403 专用于已认证的安全路径拒绝。
