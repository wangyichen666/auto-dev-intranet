# Auto Dev 内网操作控制台

独立项目 `auto-dev-intranet`，用于创建、监控与控制 `agent-auto-dev` 任务。根路径进入任务中心；未认证时先验证访问令牌。生产模式只连接真实上游；没有配置或连接失败时明确显示服务不可用。

## 架构与边界

```text
浏览器 → React Web → FastAPI BFF → AgentAutoDevGateway
                                → 上游 Application Service / Ports
                                → 上游 SQLite / 工作区 / 调度器
```

Web 在 `src/`；BFF 在 `server/src/auto_dev_intranet/`；测试替身只在 `server/tests/`。没有复制上游状态机、SQL、执行器或 Git 逻辑，也不通过 shell/CLI 查询或控制任务。BFF 的状态与可用操作字段是领域事实的展示投影，最终迁移始终由上游事务、revision、租约及执行锁裁决。

上游固定版本：[main commit c414544a8b1c137357892461b84050f8d85f92c8](https://github.com/wangyichen666/agent-auto-dev/tree/c414544a8b1c137357892461b84050f8d85f92c8)，Python 分发包 `dtcoder-agentic-dev==0.1.0`。`server/pyproject.toml` 锁定完整 commit；`server/uv.lock` 锁定传递依赖。上游检查副本不属于本项目、不在本项目中提交。

前端：React 18、TypeScript 5、Vite、Ant Design 5、React Query、Less Modules、SOFA icons。公共 npm 源对 `@alipay/bigfish` 和 `@alipay/tech-ui` 返回 404，采用需求允许的公开组件替代，保留相同信息架构。依赖版本和 npm 锁文件均提交。

## 安装

本批验证使用 Node 25 和 Python 3.12，CI 使用 Node 22 / Python 3.12。建议 Python 3.12；首次用本机 3.14 安装旧版 Pydantic 时需要源码编译，因此开发环境使用现有 3.12。

```bash
npm ci
python3.12 -m venv .venv312
.venv312/bin/pip install -e 'server[dev]'
```

如使用 uv，按锁文件安装：

```bash
uv sync --project server --locked --extra dev --python 3.12
# 对应 Python 路径：server/.venv/bin/python
```

## 配置与开发

`.env.example` 只包含占位值。自行创建 `.env`，不要提交真实配置或凭据。

- `AGENT_AUTO_DEV_CONFIG`：已有上游配置文件，BFF 与 daemon 必须使用同一个文件及状态目录。
- `INTRANET_AUTH_TOKEN`：长随机 Bearer token；未配置或未认证时 API 全部拒绝。
- `INTRANET_CORS_ORIGINS`：默认空，同源；确有需要时填写明确 origin 列表，逗号分隔，不允许 `*`。
- `INTRANET_STATIC_DIR`：生产前端构建目录；推荐绝对路径。默认项目 `dist/`。
- `INTRANET_PYTHON`：API 类型生成、E2E BFF 的 Python 路径；默认 `.venv312/bin/python`。

本项目不会自动加载 `.env`。通过部署平台或下列方式导入开发变量：

```bash
set -a
source .env
set +a
.venv312/bin/python -m uvicorn auto_dev_intranet.app:app --host 127.0.0.1 --port 8000 --no-access-log
```

另一个终端运行 `npm run dev`，打开 `http://127.0.0.1:5173`。Vite 代理 `/api` 到本地 8000；无需跨域。页面输入管理员提供的令牌，令牌只保存在当前页内存中，刷新后重新认证。

上游状态目录须由上游自己的 `init` 初始化，模板来自其配置目录。另行在上游启动 daemon，使用与 BFF 相同的配置。新建任务调用 `DeclarativeRunService.submit`，立即返回已入队任务，不运行 agent、不准备/克隆工作区。daemon 才执行后续节点。

## 页面

| 路由 | 已实现 |
| --- | --- |
| `/tasks` | 状态/搜索/URL 分页、真实运行列表、活动轮询、快捷暂停、新建任务、空/筛选空/错误/不可用 |
| `/tasks/:runId` | 冻结 stage/job、全部 attempts、持久化输出摘要、allowedActions 控制、恢复模式与反馈、事件、产物、安全预览与下载 |
| `/workflows` | 配置目录直属模板、搜索、刷新、粘贴/上传严格校验 |
| `/workflows/:templateId` | 只读 YAML 与结构概览 |
| `/repositories` | 安全字段与能力配置，只读 |
| `/system` | BFF/上游版本、状态目录/数据库可达性、daemon、租约心跳、已注册 agents/tools 和诊断 |

中文/英文文案完整，运行原文保留上游语言。桌面侧栏、移动抽屉、窄屏详情 tabs。API 和用户可见错误码见 [docs/api.md](docs/api.md)。

## 检查

```bash
npm ci
npm run lint
npm run typecheck
npm test -- --runInBand
npm run api:types
npm run build
cd server
../.venv312/bin/python -m pytest -q
../.venv312/bin/python -m compileall -q src tests
../.venv312/bin/ruff check src tests
../.venv312/bin/ruff format --check src tests
```

`--runInBand` 由脚本转换为 Vitest 单次运行参数，不传入不支持的 CLI 选项。生成类型无需启动服务器或连接上游。

```bash
npm run test:e2e
```

E2E 启动 `tests.e2e_app:app` 的确定性 fake 和 Vite，使用测试专用 token；不调用真实 agent、不访问用户仓库。测试使用专用端口 18000 / 15173，不复用开发服务。默认复用本机 Chrome，不自动安装浏览器；CI 按显式测试需求安装 Chrome。如本机无 Chrome，可先安装或在 Playwright 配置中切换已安装的 Chromium。

完整验收范围与记录见 [docs/verification.md](docs/verification.md)。

后续按用户明确授权完成本机 Claude Code 的真实浏览器闭环，记录见 [docs/live-claude-e2e.md](docs/live-claude-e2e.md)。真实模型用量不纳入默认测试或 CI；本机初始化事件上报的模型为 `deepseek-v4-flash`。

## 部署

```bash
npm run build
# 先通过平台注入上述环境变量。
.venv312/bin/python -m uvicorn auto_dev_intranet.app:app --host 127.0.0.1 --port 8000 --no-access-log
```

BFF 提供构建资源与 SPA fallback；`/api` 404 保留 JSON 错误，不落回 HTML。让内网反向代理将 Web/API 同源转发到回环端口，配置 TLS、身份入口、网络 ACL、请求上限和超时。BFF 与 daemon 使用同一服务身份和本地状态卷；SQLite/进程锁不适合跨节点 NFS 分布式执行。本批是内网单实例基础实现，不宣称生产级公网、多租户或 RBAC 已完成。

## 已知边界

- 无 WebSocket 或实时流式日志，只显示上游保存的 2048 字符 stdout/stderr 摘要。
- 上游未暴露安全认证探测接口，执行器登录状态显示“未探测”。诊断不调用真实模型或 Git 写操作。
- daemon 状态来自上游身份核验；前台 run 进程未被此 daemon PID 契约覆盖。
- 最近心跳是持有租约运行的 `updated_at`，没有可读取的独立全局 daemon 心跳。
- 最多聚合 10000 条运行；超过上限返回容量错误，后续需上游分页 Port，绝不静默截断历史。
- 上游产物记录没有固定 size 字段；列表大小可显示未知，内容访问返回实际大小。预览 256 KiB，下载 20 MiB；清理后产物记录保留，文件访问返回 404。
- 文本预览/下载经过脱敏，返回正文可能与原始记录的 SHA-256 不同；界面展示的是上游捕获的原始摘要。
- frozen definition 或 Issue 丢失时保留其余详情，返回明确 warning。缺少可安全读取的日志时不伪造内容。
- 没有多仓、结构化 handoff、完整文件中心、资源采样、备份、定时清理、工作流市场或拖拽编辑。
- 已完成临时目录内的真实 Application Service 契约验证及本机 Claude Code 无仓任务执行；未验证 Anthropic 原生模型、其他执行器、远端流水线或生产内网部署。
