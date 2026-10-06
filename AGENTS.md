# 项目规则

- 回答与交付说明使用中文。
- 此仓库独立于 agent-auto-dev，禁止在上游写入前端目录、依赖或资源。
- 前端使用 React 18、TypeScript 5、Vite、Ant Design 5、React Query；bigfish/tech-ui 无法在公共 npm 源安装，因此使用公开替代。图标统一 @sofa-design/icons。
- 页面布局使用 PageLayout/PagePanel/PageHeader；状态使用 StatusTag；图标命令使用 IconButton/TextIconButton；业务弹窗使用 BusinessModal；危险动作使用 DangerConfirm。
- 页面 Less Modules 只拥有业务布局；跨组件规则归 src/styles/global.less；颜色来自 tokens.less，Ant Design 主题归 styles/theme.ts。禁止 !important、手绘 SVG 和假指标。
- 所有固定 UI 文案归 src/locales/zh-CN.ts 和 en-US.ts。上游数据原文保留原语言。不要在 JSX 硬编码文案。
- API 类型通过 npm run api:types 从本项目 Pydantic/OpenAPI 生成；更改 HTTP DTO 后更新 config/openapi.json 和 src/typings/generated.ts。
- 生产 Gateway 只调用固定上游组合根和 Application Service/Ports。禁止 SQL、CLI subprocess、业务状态迁移与 HTTP 内执行节点。fake 只能放在 server/tests，生产不得导入。
- API 默认拒绝未认证请求；凭据通过环境提供，不写入仓库。不得记录任务正文、反馈、认证信息或 traceback。
- 安全文件读取必须按记录归属定位，限制大小，使用 openat/O_NOFOLLOW 拒绝所有符号链接；不接受客户端文件路径。
- 必跑：npm ci、npm run lint、npm run typecheck、npm test -- --runInBand、npm run build；server 内 python -m pytest -q、python -m compileall -q src tests、ruff check src tests、ruff format --check src tests；npm run test:e2e。
- 端到端必须使用确定性 fake，不启动真实模型、不访问用户仓库；浏览器验收含 1440×900、1024×768、390×844。变更双栏布局时追加 768×1024、1920×1080、2560×1080。
