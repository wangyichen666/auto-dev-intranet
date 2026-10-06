# 安全与部署边界

## 认证

API 默认拒绝；必须注入 `INTRANET_AUTH_TOKEN`，使用固定 Bearer token 和 constant-time comparison。没有认证绕过开关或 token query 参数。静态壳可以加载，业务数据不能匿名读取。鉴权先于请求正文与 Gateway；未设置服务器 token 也全部 401。生产不导入测试 Gateway。

当前一个 token 对应全操作权限；没有 RBAC、多租户、用户审计归属或 token 轮换协议。需要更细权限时，在创建应用/部署边界注入企业认证与授权，不让 BFF 信任未经隔离的代理身份头。反向代理应限制网络入口、配置 TLS、请求速率/大小和身份管理。不要直接公网暴露。

默认绑定 127.0.0.1；启动示例关闭 Uvicorn access log，应用日志只记录异常类型与 request ID，不记录任务、反馈、正文、认证信息或 traceback。上游日志策略由上游负责；服务目录应只对运行账号可读。

## 文件与模板

模板只能是配置模板目录直属安全 YAML 文件名；拒绝绝对路径、`..`、分隔符、非 YAML 后缀以及符号链接。不允许客户端传服务器路径。使用上游严格 YAML parser（包括重复键和未知字段拒绝）；验证不上队、不执行、不保存。

产物先检查真实记录所属 run，再检查 workspace 位于 config.workspace.workspaces；逐级 openat + O_NOFOLLOW，拒绝根/父目录/最终文件符号链接，fstat 必须是普通文件。使用 O_NONBLOCK 避免 FIFO 阻塞，读取前后都有大小上限；不接受任意路径，不允许 `..`。受管目录仍须由可信服务身份独占，禁止不可信用户移动目录或挂载设备。

预览文本最大 256 KiB，下载 20 MiB；模板 1 MiB。二进制只作为 attachment 返回。MIME 采用受限后缀 allowlist，文本必须有效 UTF-8 且无 NUL。静态资源位于指定 dist 根，缺失资源 404；API 404 不落回 SPA。

## 脱敏与显示

递归过滤 token、authorization、cookie、password、secret、credential、AK/SK 等键；文本同步遮蔽键值、Bearer/Basic、凭据 URL 与常见宿主绝对路径。URL 去除认证信息和整个 query/fragment。上下文限制深度、键/元素数量与 32 KiB；操作只返回安全字段，不暴露 request_snapshot、命令、环境变量值或 pipeline params。

日志只使用上游持久化摘要。产物的文本预览和文本下载也脱敏；因此返回正文可能与记录 SHA-256 不同，SHA-256 标识上游原始产物。二进制无法做通用语义脱敏，须依靠已认证操作者、受管产物策略和网络访问限制。

Markdown 使用 react-markdown：skipHtml 禁止原始 HTML，图片不加载，链接显示文本，脚本/iframe 不执行。JSON/YAML/普通文本以 React 转义的 pre 显示。浏览器不会打开产物 HTML，认证下载均为 attachment + nosniff。

CORS 默认同源；只允许明确 origins，忽略通配配置。响应包含 request ID、nosniff、no-store、same-origin referrer policy。令牌只保存在页内存，不进入 localStorage、sessionStorage、URL 或仓库。
