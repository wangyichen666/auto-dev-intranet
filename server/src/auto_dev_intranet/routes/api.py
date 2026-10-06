from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from ..dependencies import gateway
from ..errors import APIError, map_upstream
from ..schemas import (
    ArtifactContent,
    CreateRunCommand,
    ErrorResponse,
    Event,
    Page,
    RepositorySummary,
    RunActionCommand,
    RunDetail,
    RunFilters,
    RunSummary,
    Status,
    SystemHealth,
    WorkflowDetail,
    WorkflowSource,
    WorkflowSummary,
    WorkflowValidation,
)

router = APIRouter(
    prefix="/api/v1",
    responses={
        code: {"model": ErrorResponse, "description": description}
        for code, description in {
            400: "参数错误",
            401: "未认证",
            403: "安全边界拒绝",
            404: "资源不存在",
            409: "状态/并发/会话冲突",
            413: "请求或内容过大",
            422: "YAML 校验失败",
            500: "内部错误",
            503: "上游或所需能力不可用",
        }.items()
    },
)
Gateway = Annotated[object, Depends(gateway)]


def call(fn, *args, action=False, validation=False):
    try:
        return fn(*args)
    except APIError:
        raise
    except Exception as exc:
        raise map_upstream(exc, action=action, validation=validation) from exc


@router.get("/health", response_model=SystemHealth)
@router.get("/system", response_model=SystemHealth)
def health(gw: Gateway):
    return call(gw.health)


@router.get("/runs", response_model=Page[RunSummary])
def runs(
    gw: Gateway,
    status: Status | None = None,
    query: str = Query("", max_length=200),
    page: int = Query(1, ge=1, le=10000),
    pageSize: int = Query(20, ge=1, le=100),
):
    return call(gw.list_runs, RunFilters(status=status, query=query, page=page, pageSize=pageSize))


@router.post("/runs", response_model=RunDetail, status_code=201)
def create(command: CreateRunCommand, gw: Gateway):
    return call(gw.create_run, command)


@router.get("/runs/{run_id}", response_model=RunDetail)
def detail(run_id: str, gw: Gateway):
    return call(gw.get_run, run_id)


@router.post("/runs/{run_id}/actions", response_model=RunDetail)
def action(run_id: str, command: RunActionCommand, gw: Gateway):
    return call(gw.control_run, run_id, command, action=True)


@router.get("/runs/{run_id}/events", response_model=list[Event])
def events(run_id: str, gw: Gateway):
    return call(gw.get_run, run_id).events


@router.get("/runs/{run_id}/artifacts/{artifact_id}/content", response_model=ArtifactContent)
def content(run_id: str, artifact_id: str, gw: Gateway):
    return call(gw.read_artifact, run_id, artifact_id)


@router.get("/runs/{run_id}/artifacts/{artifact_id}/download")
def download(run_id: str, artifact_id: str, gw: Gateway):
    name, data = call(gw.download_artifact, run_id, artifact_id)
    return Response(
        data,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(name, safe='')}",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/workflows", response_model=list[WorkflowSummary])
def workflows(gw: Gateway):
    return call(gw.list_workflows)


@router.post("/workflows/validate", response_model=WorkflowValidation)
def validate(command: WorkflowSource, gw: Gateway):
    result = call(gw.validate_workflow, command.source, validation=True)
    if not result.valid:
        raise APIError(422, "WORKFLOW_INVALID", "YAML 校验失败", result.errors)
    return result


@router.get("/workflows/{template_id}", response_model=WorkflowDetail)
def workflow(template_id: str, gw: Gateway):
    return call(gw.get_workflow, template_id)


@router.get("/repositories", response_model=list[RepositorySummary])
def repositories(gw: Gateway):
    return call(gw.list_repositories)
