"""仅测试使用的确定性 Gateway，生产 app 永不导入此模块。"""

import copy
import hashlib
import json

from auto_dev_intranet.errors import APIError, not_found
from auto_dev_intranet.schemas import (
    Artifact,
    ArtifactContent,
    Attempt,
    Event,
    Page,
    RepositorySummary,
    RunDetail,
    RunSummary,
    Status,
    SystemHealth,
    WorkflowDetail,
    WorkflowSummary,
    WorkflowValidation,
)

SOURCE = """name: document
version: '1'
description: 编写并检查文档
stages: [write, verify]
jobs:
  document:
    stage: write
    agent: default
    prompt: 根据任务需求编写 report.md
  verify:
    stage: verify
    type: tool
    toolName: file.copy
    config: {source: report.md, target: verified.md}
"""
GRAPH = {
    "stages": [
        {"name": "write", "jobs": [{"name": "document", "type": "agent", "agent": "default"}]},
        {"name": "verify", "jobs": [{"name": "verify", "type": "tool", "tool": "file.copy"}]},
    ],
    "loops": [],
}
STAMP = "2026-10-06T06:00:00Z"
REPORT = "# 测试报告\n\n端到端产物预览成功。"


class FakeGateway:
    def __init__(self, *, seed=False, advance=False):
        self.runs = {}
        self.advance = advance
        self.reads = {}
        self.last_command = None
        self.conflict = False
        if seed:
            from auto_dev_intranet.schemas import CreateRunCommand

            self.create_run(
                CreateRunCommand(
                    task="补充 API 文档与异常恢复测试", workflowTemplateId="document.yaml"
                )
            )
            r = self.runs["test-run-001"]
            r.run.status = Status.RUNNING
            r.run.allowedActions = r.allowedActions = ["pause", "cancel"]
            r.run.startedAt = STAMP
            r.attempts = [
                Attempt(
                    attemptId="attempt-1",
                    job="document",
                    stage="write",
                    number=1,
                    status="RUNNING",
                    engine="claude-cli",
                    model="test-model",
                    hasSession=True,
                    startedAt=STAMP,
                    stdout="测试中持久化的有界输出摘要",
                )
            ]

    def health(self):
        return SystemHealth(
            bffVersion="0.1.0",
            upstreamVersion="测试替身",
            upstreamCommit="test",
            upstreamAvailable=True,
            databaseReachable=True,
            stateReachable=True,
            daemon="RUNNING",
            agents=["default", "claude-cli", "codex-cli"],
            tools=["file.copy"],
            diagnostics=[{"code": "TEST_ONLY", "message": "当前为确定性测试 Gateway"}],
        )

    def list_runs(self, filters):
        rows = [copy.deepcopy(x.run) for x in self.runs.values()]
        rows = [
            r
            for r in rows
            if (not filters.status or r.status == filters.status)
            and (
                not filters.query
                or filters.query.casefold() in f"{r.runId} {r.title} {r.workflowName}".casefold()
            )
        ]
        rows.sort(key=lambda r: (r.createdAt, r.runId), reverse=True)
        start = (filters.page - 1) * filters.pageSize
        return Page(
            items=rows[start : start + filters.pageSize],
            page=filters.page,
            pageSize=filters.pageSize,
            total=len(rows),
        )

    def get_run(self, run_id):
        if run_id not in self.runs:
            raise not_found("任务")
        if self.advance:
            self.reads[run_id] = self.reads.get(run_id, 0) + 1
            if self.reads[run_id] >= 3:
                self.complete(run_id)
            elif self.reads[run_id] >= 2:
                self.runs[run_id].run.status = Status.RUNNING
        return copy.deepcopy(self.runs[run_id])

    def complete(self, run_id):
        r = self.runs[run_id]
        r.run.status = Status.SUCCEEDED
        r.run.startedAt = STAMP
        r.run.finishedAt = STAMP
        r.run.currentStage = None
        r.run.currentJob = "__complete"
        r.allowedActions = r.run.allowedActions = []
        r.attempts = [
            Attempt(
                attemptId="attempt-1",
                job="document",
                stage="write",
                number=1,
                status="SUCCEEDED",
                engine="claude-cli",
                startedAt=STAMP,
                finishedAt=STAMP,
                artifactIds=["artifact-1"],
                stdout="\n".join(
                    json.dumps(event, ensure_ascii=False)
                    for event in [
                        {"type": "system", "subtype": "init", "model": "test-model"},
                        {
                            "type": "assistant",
                            "message": {"content": [{"type": "text", "text": "测试产物已保存"}]},
                        },
                        {"type": "result", "result": "文档已生成"},
                    ]
                ),
            ),
            Attempt(
                attemptId="attempt-2",
                job="verify",
                stage="verify",
                number=2,
                status="SUCCEEDED",
                startedAt=STAMP,
                finishedAt=STAMP,
                stdout="测试中的文档校验节点已完成",
            ),
            Attempt(
                attemptId="attempt-3",
                job="__complete",
                number=3,
                status="SUCCEEDED",
                startedAt=STAMP,
                finishedAt=STAMP,
            ),
        ]
        r.artifacts = [
            Artifact(
                artifactId="artifact-1",
                name="report.md",
                kind="markdown",
                job="document",
                stage="write",
                attemptId="attempt-1",
                sha256=hashlib.sha256(REPORT.encode()).hexdigest(),
                size=len(REPORT.encode()),
                createdAt=STAMP,
                previewable=True,
            )
        ]
        r.events = [Event(eventId="event-1", type="RunSucceeded", createdAt=STAMP)]

    def create_run(self, command):
        if command.workflowTemplateId != "document.yaml":
            raise not_found("模板")
        if command.repositoryId not in {None, "repo-1"}:
            raise APIError(400, "UNKNOWN_REPOSITORY", "仓库未配置")
        run_id = f"test-run-{len(self.runs) + 1:03d}"
        self.last_command = command
        r = RunSummary(
            runId=run_id,
            title=command.task.splitlines()[0],
            status="QUEUED",
            workflowName="document",
            workflowVersion="1",
            currentJob="document",
            currentStage="write",
            repositoryId=command.repositoryId,
            repositoryMode="single" if command.repositoryId else "none",
            createdAt=STAMP,
            updatedAt=STAMP,
            allowedActions=["pause", "cancel"],
        )
        detail = RunDetail(
            run=r,
            workflowGraph=GRAPH,
            issueSummary={"body": command.task},
            allowedActions=r.allowedActions,
            conversation={"available": False, "reason": "当前节点缺少匹配的 session"},
        )
        self.runs[run_id] = detail
        return copy.deepcopy(detail)

    def control_run(self, run_id, command):
        from dtcoder_agentic_dev.domain.errors import ConcurrencyConflict

        r = self.get_run(run_id)
        if self.conflict:
            raise ConcurrencyConflict("当前原子动作仍持有租约，请等待安全边界")
        if command.action not in r.allowedActions:
            raise APIError(409, "ACTION_REJECTED", "当前状态不能执行此操作")
        if command.mode == "continue_conversation" and not r.conversation.get("available"):
            raise APIError(409, "SESSION_UNAVAILABLE", r.conversation["reason"])
        self.last_command = command
        target = {
            "pause": "PAUSED",
            "cancel": "CANCELLED",
            "resume": "QUEUED",
            "retry": "QUEUED",
            "skip": "QUEUED",
        }
        r.run.status = Status(target[command.action])
        r.allowedActions = r.run.allowedActions = {
            "PAUSED": ["resume", "cancel"],
            "CANCELLED": ["retry"],
            "QUEUED": ["pause", "cancel"],
        }[r.run.status]
        if command.feedback:
            r.feedbackHistory.append({"text": command.feedback, "mode": command.mode})
        self.runs[run_id] = r
        return copy.deepcopy(r)

    def list_workflows(self):
        d = self.get_workflow("document.yaml")
        return [WorkflowSummary(**d.model_dump(exclude={"source", "graph"}))]

    def get_workflow(self, template_id):
        if template_id != "document.yaml":
            raise not_found("模板")
        return WorkflowDetail(
            templateId=template_id,
            name="document",
            version="1",
            description="编写并检查文档",
            stageCount=2,
            jobCount=2,
            updatedAt=STAMP,
            valid=True,
            source=SOURCE,
            graph=GRAPH,
        )

    def validate_workflow(self, source):
        from dtcoder_agentic_dev.application.yaml_workflows import parse_workflow
        from dtcoder_agentic_dev.domain.errors import ConfigurationError

        from auto_dev_intranet.serialization import graph

        if len(source.encode()) > 1048576:
            raise APIError(413, "WORKFLOW_TOO_LARGE", "YAML 超过 1 MiB")
        try:
            d = parse_workflow(
                source, agents={"default", "claude-cli", "codex-cli"}, tools={"file.copy"}
            )
            return WorkflowValidation(valid=True, name=d.name, version=d.version, graph=graph(d))
        except ConfigurationError as exc:
            return WorkflowValidation(
                valid=False, errors=[{"field": "source", "message": str(exc)}]
            )

    def list_repositories(self):
        return [
            RepositorySummary(
                repositoryId="repo-1",
                name="test-repository",
                provider="logging",
                project="test/project",
                remote="https://example.invalid/project.git",
                baseBranch="main",
                pipelineEnabled=False,
                capability="OFFLINE",
            )
        ]

    def read_artifact(self, run_id, artifact_id):
        r = self.get_run(run_id)
        if not any(a.artifactId == artifact_id for a in r.artifacts):
            raise not_found("产物")
        return ArtifactContent(
            name="report.md",
            mime="text/markdown",
            content=REPORT,
            size=len(REPORT.encode()),
            previewable=True,
        )

    def download_artifact(self, run_id, artifact_id):
        c = self.read_artifact(run_id, artifact_id)
        return c.name, c.content.encode()
