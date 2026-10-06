"""认证、递归脱敏和无符号链接文件读取；不接触业务状态。"""

import json
import os
import re
import stat
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from .errors import APIError, not_found

SECRET = re.compile(
    r"token|authorization|cookie|password|passwd|secret|credential|access[_-]?key|^ak$|^sk$", re.I
)


def safe_url(value: str) -> str:
    try:
        p = urlsplit(value)
        if p.scheme:
            if p.scheme not in {"http", "https", "ssh", "git"} or not p.hostname:
                return "[已隐藏]"
            host = p.hostname + (f":{p.port}" if p.port else "")
            return urlunsplit((p.scheme, host, p.path, "", ""))
        return re.sub(r"^[^@/]+@", "", value.split("?")[0].split("#")[0])
    except ValueError:
        return "[已隐藏]"


def safe_text(value: str, limit: int = 8192) -> str:
    value = value[:limit]
    # 限制键长度并锚定单词边界，避免大文件上的无界回溯。
    value = re.sub(r"(?i)(cookie\s*[:=]\s*)[^\r\n]+", r"\1[已隐藏]", value)
    value = re.sub(
        r"(?i)(?<![\w-])([\"']?(?:authorization|password|passwd|"
        r"[\w-]{0,64}(?:token|secret|credential|access[_-]?key)|ak|sk)[\"']?\s*[:=]\s*)"
        r"(?:bearer\s+|basic\s+)?(?:\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|[^\s,;}]+)",
        r"\1[已隐藏]",
        value,
    )
    value = re.sub(
        r"(?m)(?:命令失败|command failed|command=|argv=|cmd=)[^\r\n]+",
        "[执行命令已隐藏]",
        value,
        flags=re.I,
    )
    value = re.sub(r"(?:https?|ssh|git)://[^\s<>\"']+", lambda m: safe_url(m[0]), value)
    value = re.sub(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/-]+=*", "[已隐藏]", value)
    # 诊断、日志和 context 不泄露宿主绝对路径。
    value = re.sub(
        r"(?<![\w:/])/(?:Users|home|tmp|var|opt|etc|srv|private)/[^\s\"'<>]*", "[受管路径]", value
    )
    value = re.sub(r"[A-Za-z]:\\[^\s\"'<>]+", "[受管路径]", value)
    return value[:limit]


def redact(value, depth=0):
    if depth > 8:
        return "[已截断]"
    if isinstance(value, dict):
        return {
            safe_text(str(k), 128): "[已隐藏]" if SECRET.search(str(k)) else redact(v, depth + 1)
            for k, v in list(value.items())[:100]
        }
    if isinstance(value, (list, tuple)):
        return [redact(v, depth + 1) for v in value[:200]]
    if isinstance(value, str):
        return safe_text(value)
    return value


def bounded_context(value):
    result = redact(value)
    if len(json.dumps(result, ensure_ascii=False).encode()) > 32768:
        return {"truncated": True}
    return result


def safe_template(root: Path, template_id: str) -> Path:
    if (
        not template_id
        or len(template_id) > 200
        or ".." in template_id
        or "/" in template_id
        or "\\" in template_id
        or Path(template_id).suffix.lower() not in {".yaml", ".yml"}
    ):
        raise APIError(400, "INVALID_TEMPLATE_ID", "模板 ID 必须是直属 YAML 文件名")
    path = root / template_id
    if path.is_symlink():
        raise APIError(400, "UNSAFE_TEMPLATE", "不允许符号链接模板")
    if not path.is_file():
        raise not_found("模板")
    return path


def read_managed_file(root: Path, relative: Path, limit: int) -> bytes:
    """逐级 openat + O_NOFOLLOW，避免检查与打开之间的符号链接竞态。"""
    if (
        relative.is_absolute()
        or not relative.parts
        or any(p in {"..", "."} for p in relative.parts)
    ):
        raise APIError(403, "UNSAFE_PATH", "文件路径超出受管范围")
    # 从文件系统锚点逐级打开根目录，父目录检查与使用之间也不能跟随符号链接。
    absolute = Path(os.path.abspath(root))
    fd = None
    try:
        fd = os.open(absolute.anchor, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        for part in absolute.parts[1:]:
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        for part in relative.parts[:-1]:
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        file_fd = os.open(relative.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        with os.fdopen(file_fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode):
                raise APIError(403, "UNSAFE_FILE", "产物必须是普通文件")
            if info.st_size > limit:
                raise APIError(413, "ARTIFACT_TOO_LARGE", "产物超过访问大小限制")
            data = stream.read(limit + 1)
            if len(data) > limit:
                raise APIError(413, "ARTIFACT_TOO_LARGE", "产物超过访问大小限制")
            return data
    except FileNotFoundError as exc:
        raise not_found("文件") from exc
    except OSError as exc:
        raise APIError(403, "UNSAFE_PATH", "文件无法安全访问") from exc
    finally:
        if fd is not None:
            os.close(fd)
