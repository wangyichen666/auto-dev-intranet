from dataclasses import dataclass


@dataclass
class APIError(Exception):
    status: int
    code: str
    message: str
    details: object = None


def unavailable(code="UPSTREAM_UNAVAILABLE", message="服务不可用，请检查上游配置和状态目录"):
    return APIError(503, code, message)


def not_found(kind="资源"):
    return APIError(404, "NOT_FOUND", f"{kind}不存在或已被清理")


def map_upstream(exc, *, action=False, validation=False):
    from dtcoder_agentic_dev.domain.errors import (
        CapabilityNotConfigured,
        ConcurrencyConflict,
        ConfigurationError,
        SessionLost,
    )

    from .security import safe_text

    if isinstance(exc, ConcurrencyConflict):
        return APIError(409, "CONCURRENCY_CONFLICT", safe_text(str(exc)))
    if isinstance(exc, SessionLost):
        return APIError(409, "SESSION_LOST", "会话已丢失，请改选 revise")
    if isinstance(exc, CapabilityNotConfigured):
        return unavailable("CAPABILITY_NOT_CONFIGURED", "上游所需能力未配置")
    if isinstance(exc, ConfigurationError):
        return APIError(
            409 if action else 422 if validation else 400,
            "ACTION_REJECTED"
            if action
            else "WORKFLOW_INVALID"
            if validation
            else "INVALID_ARGUMENT",
            "上游拒绝当前操作，请刷新任务或改用 revise" if action else safe_text(str(exc)),
        )
    if isinstance(exc, (FileNotFoundError, KeyError)):
        return not_found()
    if isinstance(exc, OSError):
        return unavailable()
    return APIError(500, "INTERNAL_ERROR", "操作失败，请凭请求 ID 查询服务日志")
