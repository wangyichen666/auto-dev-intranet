# 验收记录

验收日期：2026-10-06。环境：macOS、Node 25.6.1、Python 3.12、本机 Google Chrome。CI 已配置 Node 22 / Python 3.12，但未宣称远端 GitHub Actions 已运行。

## 工程检查

| 检查 | 结果 |
| --- | --- |
| `npm ci` | 成功，npm audit 报告 0 个漏洞 |
| `npm run lint` | 通过 |
| `npm run typecheck` | 通过 |
| `npm test -- --runInBand` | 5 个文件、17 个测试通过（含真实 Claude 完成记录的回归场景） |
| `npm run api:types` | 成功；OpenAPI 与生成类型已同步 |
| `npm run build` | 成功，产物位于 `dist/` |
| `python -m pytest -q` | 29 个测试通过 |
| `python -m compileall -q src tests` | 通过 |
| `ruff check src tests` | 通过 |
| `ruff format --check src tests` | 通过 |

前端测试覆盖状态与文案、URL 筛选、新建校验与防重复提交、失败后保留输入、allowedActions、取消确认、默认节点与手动选择保持、恢复模式与反馈、隐藏页轮询、请求中止与旧响应竞态、Markdown/JSON/二进制预览、工作流逐字段校验错误。

BFF 测试覆盖默认拒绝认证、上游不可用、分页与稳定排序、无仓/单仓提交、控制与反馈、mode、租约冲突、旧 payload、模板严格校验、请求上限、产物归属/大小/编码/普通文件、根目录与父目录符号链接、路径逃逸、脱敏、API 404 和静态资源边界。

## 两类集成证据

1. `server/tests/test_integration.py` 使用锁定的真实上游组合根、Application Service 与 Repository Ports，在临时目录初始化上游状态并提交、查询、控制任务。验证真实入队、租约冲突与历史字段兼容。没有调用真实模型，也没有访问用户 Git 仓库。
2. `e2e/` 使用仅位于 `server/tests/` 的确定性 Gateway，驱动浏览器创建任务、观察排队/运行/完成、预览 Markdown 与认证下载。此证据证明 Web/BFF 的交互闭环，不代表外部模型已经认证或运行成功。

生产边界额外验证：真实 Gateway 指向不存在配置时，`/api/v1/runs` 返回 503、health 明确上游不可用；构建后的 `/tasks` 返回 SPA，未知 API 返回 JSON 404，丢失静态资源返回 404。没有回退到 fake。

按用户后续明确授权，另完成一次真实 Claude Code 浏览器闭环，使用真实 BFF、上游 daemon 与无仓任务。实际模型初始化事件报告 `deepseek-v4-flash`，不是 Anthropic 原生 Claude 模型验收声明。详细运行 ID、产物、回归修复与证据见 [真实验收记录](live-claude-e2e.md)。

## 浏览器验收

核心端到端在 1440×900、1024×768、390×844 检查任务中心、创建、详情、错误态、筛选、导航、严格 YAML 校验、产物预览与下载。扩展截图检查 768×1024、1920×1080、2560×1080，以及工作流只读源码、仓库配置、系统状态和英文界面。

Playwright 共 7 项通过、2 项计划内跳过：3 个视口各执行 2 条核心用例，桌面项目另执行 1 条包含 6 个视口的扩展矩阵。

详情在 1100px 及以下改为标签页；768px 下产物的摘要与操作不再挤入过窄侧栏。截图在弹窗可见后捕获，并禁用截图时的 CSS 过渡；关闭弹窗后等待其隐藏。检查页面无横向溢出，核心闭环和扩展矩阵无 console error、React key 警告或资源 404。

截图由 Playwright 写入 `test-results/`，本地不提交；CI 将其上传为验收 artifact。扩展矩阵只在“桌面”项目执行一次，“中屏”和“移动”的同名扩展用例主动跳过，避免重复；这两个项目仍分别执行自己的核心闭环与错误态用例。

## 剩余弱点与未验证项

- 最弱的界面验证维度是大规模数据密度：截图使用少量确定性样本，尚未以大量真实历史记录、长工作流与多轮 attempts 做用户评估。
- Vite 仍提示共享入口超过 500 kB：约 701 kB、gzip 227 kB；页面已按路由懒加载，公共组件依赖仍有后续拆分空间。没有通过调高警告阈值隐藏此项。
- Python 测试有一条来自 Starlette TestClient 对 AnyIO 别名引用的弃用警告；不影响测试结果。Playwright 运行器的 `NO_COLOR` / `FORCE_COLOR` 环境提示也不属于浏览器 console 错误。
- 已用独立临时配置和现有本机登录态验证真实 Claude Code 无仓执行；未验证其他执行器、Anthropic 原生模型、远端 pipeline、长期 daemon 运行或实际内网反向代理部署。
- 执行器认证与独立全局 daemon 心跳缺少安全查询契约，界面显示未探测/未知。只展示已持久化输出摘要，没有实时日志流。
- 多仓、完整文件中心、结构化 handoff、工作流市场、资源监控、备份和定时清理均不属于本批已完成能力。单 Bearer 认证不等于 RBAC、多租户或生产级公网部署。
