import hmac
import logging
import os
import threading
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException
from starlette.middleware.cors import CORSMiddleware

from .errors import APIError
from .routes.api import router
from .security import bounded_context, safe_text
from .upstream import UpstreamGateway

MAX_BODY = 1048576 + 65536  # 允许 JSON 转义开销；source 解码后仍严格限制 1 MiB。
log = logging.getLogger("auto_dev_intranet")


def error_response(error, request_id):
    return JSONResponse(
        status_code=error.status,
        content={
            "error": {
                "code": error.code,
                "message": safe_text(error.message),
                "details": bounded_context(error.details) if error.details is not None else None,
                "requestId": request_id,
            }
        },
        headers={"X-Request-ID": request_id},
    )


class BoundaryMiddleware:
    def __init__(self, app, token):
        self.app, self.token = app, token

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        request_id = uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        path = scope["path"]
        headers = dict(scope["headers"])
        if path == "/api" or path.startswith("/api/"):
            expected = f"Bearer {self.token}".encode() if self.token else b""
            supplied = headers.get(b"authorization", b"")
            if not expected or not hmac.compare_digest(supplied, expected):
                return await error_response(
                    APIError(401, "UNAUTHORIZED", "请提供有效的访问令牌"), request_id
                )(scope, receive, send)
        body = bytearray()
        if scope["method"] in {"POST", "PUT", "PATCH"}:
            try:
                too_big = int(headers.get(b"content-length", b"0")) > MAX_BODY
            except ValueError:
                too_big = True
            if too_big:
                return await error_response(
                    APIError(413, "REQUEST_TOO_LARGE", "请求超过大小限制"), request_id
                )(scope, receive, send)
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                body.extend(message.get("body", b""))
                if len(body) > MAX_BODY:
                    return await error_response(
                        APIError(413, "REQUEST_TOO_LARGE", "请求超过大小限制"), request_id
                    )(scope, receive, send)
                if not message.get("more_body"):
                    break
            sent_body = False
            original_receive = receive

            async def replay():
                nonlocal sent_body
                if not sent_body:
                    sent_body = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await original_receive()

            receive = replay

        async def safe_send(message):
            if message["type"] == "http.response.start":
                message["headers"] += [
                    (b"x-request-id", request_id.encode()),
                    (b"x-content-type-options", b"nosniff"),
                    (b"cache-control", b"no-store"),
                    (b"referrer-policy", b"same-origin"),
                ]
            await send(message)

        try:
            await self.app(scope, receive, safe_send)
        except Exception as exc:
            # 只记异常类型与请求 ID，绝不打印请求正文、错误对象或 traceback。
            log.error("请求失败 request_id=%s type=%s", request_id, type(exc).__name__)
            await error_response(APIError(500, "INTERNAL_ERROR", "服务内部错误"), request_id)(
                scope, receive, send
            )


class LockedGateway:
    """串行访问进程内组合根，避免共享 connection 的事务交错；跨进程锁由上游管理。"""

    def __init__(self, inner):
        self.inner, self.lock = inner, threading.RLock()

    def __getattr__(self, name):
        def wrapped(*args, **kwargs):
            with self.lock:
                return getattr(self.inner, name)(*args, **kwargs)

        return wrapped


def create_app(gateway=None, *, token=None, static_dir=None):
    selected = LockedGateway(gateway if gateway is not None else UpstreamGateway())

    @asynccontextmanager
    async def lifespan(app):
        yield
        if isinstance(selected.inner, UpstreamGateway):
            await run_in_threadpool(selected.close)

    app = FastAPI(
        title="Auto Dev 内网 API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.gateway = selected
    app.add_middleware(
        BoundaryMiddleware, token=token if token is not None else os.getenv("INTRANET_AUTH_TOKEN")
    )
    origins = [x for x in os.getenv("INTRANET_CORS_ORIGINS", "").split(",") if x]
    if origins and "*" not in origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_methods=["GET", "POST"],
            allow_headers=["Authorization", "Content-Type"],
        )

    @app.exception_handler(APIError)
    async def api_error(request: Request, exc: APIError):
        return error_response(exc, request.state.request_id)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        fields = [
            {
                "field": ".".join(map(str, e["loc"])),
                "code": e["type"],
                "message": "参数类型或范围无效",
            }
            for e in exc.errors()
        ]
        return error_response(
            APIError(400, "INVALID_ARGUMENT", "请检查请求参数", fields), request.state.request_id
        )

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        return error_response(
            APIError(
                exc.status_code,
                "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR",
                "接口或资源不存在",
            ),
            request.state.request_id,
        )

    app.include_router(router)

    @app.get("/api/v1/openapi.json", include_in_schema=False)
    def openapi():
        return JSONResponse(app.openapi())

    root = Path(
        static_dir or os.getenv("INTRANET_STATIC_DIR", Path(__file__).parents[3] / "dist")
    ).resolve()

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path == "api" or path.startswith("api/"):
            raise APIError(404, "NOT_FOUND", "接口不存在")
        requested = (root / path).resolve()
        if not requested.is_relative_to(root):
            raise APIError(404, "NOT_FOUND", "资源不存在")
        if requested.is_file() and not requested.is_symlink():
            return FileResponse(requested)
        if path.startswith("assets/") or Path(path).suffix:
            raise APIError(404, "NOT_FOUND", "静态资源不存在")
        index = root / "index.html"
        if index.is_file():
            return FileResponse(index)
        return JSONResponse({"message": "前端未构建，请运行 npm run build"}, status_code=503)

    return app


app = create_app()
