# 上游集成与证据矩阵

2026-10-06 核验 GitHub `main`，固定为 `c414544a8b1c137357892461b84050f8d85f92c8`，不无约束跟随 main。

| 能力 | 上游证据（相对上游包） | BFF 对接 |
| --- | --- | --- |
| 组合根 | `cli/bootstrap.py:build_runtime` | 延迟装配并复用 Runtime；关闭时 runtime.close |
| 列表 | `ports/run_repository.py:list_runs` | 有上限的稳定筛选、搜索、分页 |
| 详情 | `application/services/runs.py:RunService.details` | attempts/artifacts/operations + Port load_issue/list_events + frozen definition |
| 创建 | `application/services/declarative.py:submit` | 服务器模板解析、仓库精确 ID 检查，再 submit；不执行节点 |
| 校验 | `DeclarativeRunService.parse` | 同一 StrictLoader/字段规则；未执行 compile/节点 |
| 控制 | `RunService.control/retry` | 直接调用，保留 mode/feedback 和原始结果 |
| 模板冻结 | `declarative.definitions.read` | 只读取原/解析后定义，禁止 runner_for（后者可能触发恢复写入） |
| 仓库 | config.repositories + `RunService.resolve_repository` | 只展示 allowlist 字段；创建时使用完整 ID |
| daemon | `infrastructure/process/daemon.py:DaemonManager.status` | 上游结构化 ps 身份核验，只调用 status，不启动/停止/杀进程 |
| 产物 | `RunRepository.list_artifacts` | runId + artifactId + workspace/workspaces 边界 + 安全普通文件读取 |
| 输出 | attempt.output.facts.execution.stdout/stderr | 已落盘 2048 字符摘要，不读任意日志路径 |
| 原始状态 | domain/models RunStatus/AttemptStatus | 逐字保留，无百分比或虚构状态 |

没有调用上游 CLI、没有打开 SQLite connection、没有执行 SQL；状态 Port 由上游组合根装配，BFF 只依赖其接口。BFF 进程内 RLock 防止共享 Runtime 连接交错，SQLite、跨进程 revision、租约、heartbeat、执行锁由上游实现。展示用 allowedActions 没有执行迁移，也不能绕过最终 409。

详情聚合通过上游 `store.transaction()` 在同一快照内读取运行、Issue、attempts、产物与事件，再序列化为明确 DTO；此处复用 Port 的事务接口，没有另建数据库连接或事务实现。

## daemon 协作

BFF 和 daemon 必须使用相同 `AGENT_AUTO_DEV_CONFIG`、同一服务账号、同一状态卷。submit 写入真正的队列与冻结定义；daemon 独立领取任务、准备受管工作区/worktree、执行 stage/job，并落盘 attempts、events、artifacts。HTTP 不等待模型节点。

daemon status 可以调用上游自己的只读进程身份核验（结构化参数，shell=False）。没有在 BFF 中重写 PID/kill 规则。API 查询和诊断不执行 Git 写入，也不测试模型认证。

## 兼容与限制

- 版本锁含 SHA；升级必须重新核验方法签名/字段并运行真实适配层契约测试。
- 历史 Issue 工作流没有冻结 YAML 时，详情 graph 为空，其他数据保留；历史缺少 stage、engine、model、session 的字段返回 null/未知。
- 旧 Issue retry 可能生成新运行，前端跟随返回的 run ID。
- frozen definition 丢失时返回 warning，隐藏 skip，续聊不可用；其他核心记录仍展示。
- submit 所需 prompt/skill 依赖由上游处理；模板严格 parse 通过不代表实际 agent 已认证或节点产物能生成。
- 只有单仓和无仓。BFF 不克隆、不 prepare_workspace；这些由 daemon 进行。
- 上游没有稳定 HTTP/WebSocket，生产 Gateway 使用 Python Application Service。之后可替换为 HTTP Gateway，须保持本 BFF 契约与测试。

## 需要的未来上游契约

目前缺少：分页查询 Port、安全独立 daemon 心跳、无副作用执行器认证查询、标准 artifact size/MIME 元数据、安全的有界日志查询、完整资源状态、结构化 handoff、多仓任务。对应能力返回未知、受限数据或不显示操作，不绕过 Port 读取数据库。

`server/tests/test_integration.py` 在临时目录运行真实组合根和应用服务，检验 submit/control/query/lease/旧记录/产物安全。测试不调用真实 agent 或用户 Git 仓库。
