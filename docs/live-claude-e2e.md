# 本机 Claude Code 真实端到端验收

2026-10-06，按用户明确要求实际调用本机已登录的 Claude Code 2.1.63。没有使用 fake Gateway，也没有修改用户仓库或全局 Claude 配置。上游仍为固定 commit `c414544a8b1c137357892461b84050f8d85f92c8`。

## 真实调用范围

使用独立临时配置、SQLite、受管无仓工作区和随机的临时 Bearer token。BFF 提供实际 `dist/` 生产构建；浏览器通过页面创建服务器模板 `claude-live.yaml` 对应的任务。提交响应为 201 / QUEUED，尚无 attempts；之后通过上游 `DaemonManager.start()` 启动独立真实 daemon，复用上游 Application Service、租约与执行锁。

任务仅要求模型用 Write 创建中文 `report.md`，包含三条验证说明及随机标记。模板声明文件产物并由上游执行非空与标记正则校验；节点超时 120 秒、最多 8 个 turns、无重试。没有把报告正文写入脚本来替代模型生成。HTTP 只提交任务，没有在请求内执行节点。

本次根据用户授权进行手动真实验收；常规 pytest、Vitest 和 Playwright 配置继续使用离线测试/确定性 fake，CI 不会自动消耗真实模型用量。

## 结果

| 项目 | 证据 |
| --- | --- |
| 运行 ID | `83d8cb0d-a285-4e9d-bcd4-6c10f0433637` |
| 浏览器观察到的状态 | QUEUED → RUNNING → SUCCEEDED |
| 真实执行器 | `claude-cli` |
| Claude Code 初始化事件上报的模型 | `deepseek-v4-flash` |
| session | 已持久化；`625a8dee-40ba-4329-93fa-34f4a08c7993` |
| 产物 | `report.md`，260 字节，包含随机标记 `INTRANET-CLAUDE-efc23a723b8a` |
| 原始产物 SHA-256 | `26724fdf6e698b4dea4cde34f475399992fcf63498c9570d7b325584428bb8f4` |
| 浏览器预览与认证下载 | 成功，下载内容、上游原文件与产物记录的 SHA-256 一致 |
| 输出 | 真实 Claude 节点的持久化输出摘要可读取 |
| 租约 | 成功结束后已释放 |
| 浏览器错误 | console error / pageerror 均为 0 |
| 总耗时 | 18.136 秒，包含浏览器、BFF 启动和 daemon 回收 |
| 收尾 | 测试 daemon、BFF 与浏览器均已停止 |

这里验证的是本机 Claude Code 的真实调用链。实际初始化事件报告 `deepseek-v4-flash`，不能据此宣称验证了 Anthropic 原生 Claude 模型服务。未显式指定模型时，上游 attempt.model 可以为空；不凭模型名称猜测并填充这个领域字段。

## 真实数据发现的修复

上游成功收尾时还会保存内部 `__complete` attempt。原默认选择逻辑选择最后一条 attempt，因此首次进入完成的详情会展示内部收尾记录，而不是 Claude 节点的 session 和输出。现改为优先在冻结工作流的可见 jobs 中选择活动、失败或最新 attempt；没有可见节点记录的旧 payload 仍回退到全部记录。没有删除或改写上游 attempts。

新增一条回归单测验证这个实际场景。修复后复用本次已保存的真实任务，通过页面内部导航重新检查执行器、session、输出、Markdown 预览和下载，不再次调用模型。前端共 17 项测试通过，Python 29 项通过；常规端到端 7 项通过、2 项计划内跳过。lint、类型检查、构建、compileall 与 Ruff 均通过。

## 现场与限制

- 原始真实现场：`/private/tmp/auto-dev-intranet-claude-live-vwpf7104/`，包含临时配置、上游状态、冻结工作流、工作区、日志及验收驱动脚本。没有保存本次临时 API token。
- 可查看证据副本：项目 `.runtime/live-claude-20261006-83d8cb0d/`，包含 `summary.json`、排队/完成/预览截图、下载报告与修复后界面截图；该目录在 Git ignore 中。
- 首次驱动的健康探测返回非 JSON，未启动 daemon 或模型；失败现场保留于另一个临时目录。后续本地 HTTP 探测显式禁用继承代理环境，独立新现场完成真实验收。
- 这次只验证新建、真实调度执行、状态观察、输出、产物预览与下载；没有把暂停续聊、取消、超时、远端 pipeline、Git worktree 或长期负载作为这次真实验收的结果。
- 随机临时 token 未写入项目，生产认证环境仍需用户配置；测试服务已停止，记录中的临时 URL 不再可访问。
