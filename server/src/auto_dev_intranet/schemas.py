from enum import Enum
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DTO(BaseModel):
    model_config = ConfigDict(extra="forbid")


Action = Literal["pause", "resume", "retry", "cancel", "skip"]
AttemptStatus = Literal[
    "RUNNING", "SUCCEEDED", "BLOCKED", "WAITING", "SKIPPED", "FAILED", "PAUSED", "CANCELLED"
]


class Status(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    WAITING = "WAITING"
    PAUSED = "PAUSED"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class RunFilters(DTO):
    status: Status | None = None
    query: str = Field(default="", max_length=200)
    page: int = Field(default=1, ge=1, le=10000)
    pageSize: int = Field(default=20, ge=1, le=100)


class CreateRunCommand(DTO):
    task: str = Field(min_length=1, max_length=20000)
    workflowTemplateId: str = Field(min_length=1, max_length=200)
    repositoryId: str | None = Field(default=None, max_length=100)

    @field_validator("task")
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError("任务需求不能为空")
        return value.strip()


class RunActionCommand(DTO):
    action: Literal["pause", "resume", "retry", "cancel", "skip"]
    mode: Literal["revise", "continue_conversation"] = "revise"
    feedback: str | None = Field(default=None, max_length=20000)


class WorkflowSource(DTO):
    source: str = Field(min_length=1, max_length=1048576)


class RunSummary(DTO):
    runId: str
    title: str
    status: Status
    workflowName: str
    workflowVersion: str
    currentStage: str | None = None
    currentJob: str = ""
    repositoryId: str | None = None
    repositoryMode: Literal["none", "single"] = "none"
    engine: str | None = None
    createdAt: str
    updatedAt: str
    startedAt: str | None = None
    finishedAt: str | None = None
    branch: str = ""
    workspace: str | None = None
    revision: int = 0
    allowedActions: list[Action] = Field(default_factory=list)


T = TypeVar("T")


class Page(DTO, Generic[T]):
    items: list[T]
    page: int
    pageSize: int
    total: int


class Job(DTO):
    name: str
    type: str
    agent: str | None = None
    tool: str | None = None
    model: str | None = None
    allowSkip: bool = False


class Stage(DTO):
    name: str
    jobs: list[Job]


class WorkflowGraph(DTO):
    stages: list[Stage] = Field(default_factory=list)
    loops: list[dict] = Field(default_factory=list)


class WorkflowSummary(DTO):
    templateId: str
    name: str
    version: str
    description: str
    stageCount: int
    jobCount: int
    updatedAt: str
    valid: bool
    errors: list[dict] = Field(default_factory=list)


class WorkflowDetail(WorkflowSummary):
    source: str
    graph: WorkflowGraph


class WorkflowValidation(DTO):
    valid: bool
    errors: list[dict] = Field(default_factory=list)
    graph: WorkflowGraph | None = None
    name: str | None = None
    version: str | None = None


class RepositorySummary(DTO):
    repositoryId: str
    name: str
    provider: str
    project: str
    remote: str
    baseBranch: str
    pipelineEnabled: bool
    capability: str


class Attempt(DTO):
    attemptId: str
    job: str
    stage: str | None = None
    round: int = 1
    number: int
    status: AttemptStatus
    engine: str | None = None
    model: str | None = None
    hasSession: bool = False
    startedAt: str | None = None
    finishedAt: str | None = None
    errorCode: str | None = None
    errorMessage: str | None = None
    stdout: str = ""
    stderr: str = ""
    artifactIds: list[str] = Field(default_factory=list)


class Artifact(DTO):
    artifactId: str
    name: str
    kind: str
    stage: str | None = None
    job: str
    attemptId: str | None = None
    size: int | None = None
    sha256: str
    gitRevision: str | None = None
    createdAt: str
    previewable: bool


class ArtifactContent(DTO):
    name: str
    mime: str
    content: str | None = None
    size: int
    previewable: bool


class Event(DTO):
    eventId: str
    type: str
    step: str | None = None
    createdAt: str
    payload: dict = Field(default_factory=dict)


class RunDetail(DTO):
    run: RunSummary
    issueSummary: dict = Field(default_factory=dict)
    workflowGraph: WorkflowGraph = Field(default_factory=WorkflowGraph)
    stageExecutions: list[dict] = Field(default_factory=list)
    attempts: list[Attempt] = Field(default_factory=list)
    artifacts: list[Artifact] = Field(default_factory=list)
    operations: list[dict] = Field(default_factory=list)
    events: list[Event] = Field(default_factory=list)
    pausePoint: dict | None = None
    feedbackHistory: list[dict] = Field(default_factory=list)
    allowedActions: list[Action] = Field(default_factory=list)
    conversation: dict[str, Any] = Field(default_factory=dict)
    debugContext: dict = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class SystemHealth(DTO):
    bffVersion: str
    upstreamVersion: str | None = None
    upstreamCommit: str
    upstreamAvailable: bool
    databaseReachable: bool = False
    stateReachable: bool = False
    daemon: str = "UNKNOWN"
    lastHeartbeat: str | None = None
    agents: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    authentication: str = "UNKNOWN"
    diagnostics: list[dict] = Field(default_factory=list)


class ErrorInfo(DTO):
    code: str
    message: str
    details: Any = None
    requestId: str


class ErrorResponse(DTO):
    error: ErrorInfo
