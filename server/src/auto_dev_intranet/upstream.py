"""固定版本 Application Service 适配；不执行 SQL、CLI 或业务状态迁移。"""

import os
from importlib.metadata import version
from pathlib import Path

from . import UPSTREAM_COMMIT, VERSION
from .errors import APIError, not_found, unavailable
from .schemas import (
    Artifact,
    ArtifactContent,
    Page,
    RepositorySummary,
    RunDetail,
    RunSummary,
    SystemHealth,
    WorkflowDetail,
    WorkflowSummary,
    WorkflowValidation,
)
from .security import bounded_context, read_managed_file, safe_template, safe_text, safe_url
from .serialization import attempt_dto, event_dto, graph, iso, timed_dict, value

TEXT_MIMES = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".json": "application/json",
    ".yaml": "text/plain",
    ".yml": "text/plain",
    ".log": "text/plain",
    ".csv": "text/plain",
}
PREVIEW_LIMIT = 256 * 1024
DOWNLOAD_LIMIT = 20 * 1024 * 1024
TEMPLATE_LIMIT = 1024 * 1024
RUN_LIMIT = 10000


class UpstreamGateway:
    def __init__(self, config_path=None):
        self.config_path = config_path or os.getenv("AGENT_AUTO_DEV_CONFIG")
        self.runtime = None

    def _runtime(self):
        if self.runtime:
            return self.runtime
        if not self.config_path:
            raise unavailable("UPSTREAM_NOT_CONFIGURED", "服务不可用：未配置 AGENT_AUTO_DEV_CONFIG")
        from dtcoder_agentic_dev.cli.bootstrap import build_runtime
        from dtcoder_agentic_dev.domain.errors import ConfigurationError

        try:
            path = Path(self.config_path).expanduser()
            if not path.is_file():
                raise unavailable("CONFIGURATION_INVALID", "上游配置文件不可达")
            self.runtime = build_runtime(path, console_logging=False)
        except ConfigurationError as exc:
            raise unavailable("CONFIGURATION_INVALID", "上游配置无效，请检查服务器配置") from exc
        return self.runtime

    def close(self):
        if self.runtime:
            self.runtime.close()
            self.runtime = None

    def health(self):
        try:
            rt = self._runtime()
            from dtcoder_agentic_dev.infrastructure.process.daemon import DaemonManager

            daemon = DaemonManager(rt.config, self.config_path, rt.commands).status()["status"]
            runs = rt.store.list_runs()  # 通过 Port 探测真实状态存储。
            heartbeat = [r.updated_at for r in runs if r.lease_owner]
            return SystemHealth(
                bffVersion=VERSION,
                upstreamVersion=version("dtcoder-agentic-dev"),
                upstreamCommit=UPSTREAM_COMMIT,
                upstreamAvailable=True,
                databaseReachable=True,
                stateReachable=Path(rt.config.state.directory).is_dir(),
                daemon={"运行": "RUNNING", "停止": "STOPPED", "stale PID": "STALE"}.get(
                    daemon, "UNKNOWN"
                ),
                lastHeartbeat=iso(max(heartbeat)) if heartbeat else None,
                agents=sorted(rt.declarative.executors.agent_names),
                tools=sorted(rt.declarative.executors.tool_names),
                authentication="UNKNOWN",
                diagnostics=[
                    {"code": "AUTH_NOT_PROBED", "message": "执行器登录状态未探测"},
                    {"code": "HEARTBEAT_FROM_LEASE", "message": "心跳取自持有租约运行的更新时间"},
                ],
            )
        except Exception as exc:
            code = exc.code if isinstance(exc, APIError) else "UPSTREAM_UNAVAILABLE"
            return SystemHealth(
                bffVersion=VERSION,
                upstreamCommit=UPSTREAM_COMMIT,
                upstreamAvailable=False,
                diagnostics=[{"code": code, "message": "服务不可用，请检查上游配置与状态目录"}],
            )

    def _load(self, run_id):
        rt = self._runtime()
        try:
            return rt.store.load_run(run_id)
        except Exception as exc:
            from dtcoder_agentic_dev.domain.errors import ConfigurationError

            if isinstance(exc, (KeyError, ConfigurationError)):
                raise not_found("任务") from exc
            raise

    def _definition(self, run):
        if not run.context.get("workflow_definition"):
            return None
        _, resolved = self._runtime().declarative.definitions.read(
            run.run_id, run.context["workflow_definition"]
        )
        return self._runtime().declarative.parse(resolved)

    def _actions(self, run, definition=None):
        # 仅投影可显示的命令，状态写入和并发裁决仍完全由上游执行。
        status = value(run.status)
        actions = []
        if status in {"QUEUED", "RUNNING", "WAITING"}:
            actions.append("pause")
        if status == "PAUSED":
            actions.append("resume")
            if definition and any(
                j.name == run.current_step and j.policy.allow_skip for j in definition.jobs
            ):
                actions.append("skip")
        if status in {"QUEUED", "RUNNING", "WAITING", "PAUSED"}:
            actions.append("cancel")
        if status in {"FAILED", "CANCELLED"}:
            actions.append("retry")
        return actions

    def _summary(self, run, definition=None, *, issue=None, attempts=None):
        rt = self._runtime()
        try:
            issue = issue or rt.store.load_issue(run.repository_id, run.issue_external_id)
            title = safe_text(issue.title, 240)
        except Exception:
            title = run.run_id
        attempts = attempts if attempts is not None else rt.store.list_attempts(run.run_id)
        current = next((a for a in reversed(attempts) if a.step_name == run.current_step), None)
        job = (
            next((j for j in definition.jobs if j.name == run.current_step), None)
            if definition
            else None
        )
        return RunSummary(
            runId=run.run_id,
            title=title,
            status=value(run.status),
            workflowName=run.workflow_name,
            workflowVersion=run.workflow_version,
            currentJob=run.current_step,
            currentStage=current.metadata.get("stage") if current else job.stage if job else None,
            repositoryId=run.repository_id or None,
            repositoryMode="single" if run.repository_id else "none",
            engine=current.metadata.get("engine") if current else None,
            createdAt=iso(run.created_at),
            updatedAt=iso(run.updated_at),
            startedAt=iso(run.started_at),
            finishedAt=iso(run.finished_at),
            branch=safe_text(run.branch),
            revision=run.revision,
            workspace=f"managed/{run.run_id}" if run.workspace_path else None,
            allowedActions=self._actions(run, definition),
        )

    def list_runs(self, filters):
        rt = self._runtime()
        runs = rt.store.list_runs()
        if len(runs) > RUN_LIMIT:
            raise APIError(
                503, "LIST_CAPACITY_EXCEEDED", "运行记录超过首批查询上限，请扩展上游分页 Port"
            )
        items = [
            self._summary(r)
            for r in runs
            if filters.status is None or value(r.status) == filters.status.value
        ]
        query = filters.query.casefold().strip()
        items = [
            r
            for r in items
            if not query or query in f"{r.runId} {r.title} {r.workflowName}".casefold()
        ]
        items.sort(key=lambda r: (r.createdAt, r.runId), reverse=True)
        start = (filters.page - 1) * filters.pageSize
        selected = items[start : start + filters.pageSize]
        run_map = {r.run_id: r for r in runs}
        for item in selected:
            try:
                definition = self._definition(run_map[item.runId])
                if definition:
                    job = next((j for j in definition.jobs if j.name == item.currentJob), None)
                    item.currentStage = item.currentStage or (job.stage if job else None)
                    item.allowedActions = self._actions(run_map[item.runId], definition)
            except Exception:
                pass  # 已有历史记录可读；冻结定义缺失时不猜测阶段或 skip。
        return Page(
            items=selected,
            page=filters.page,
            pageSize=filters.pageSize,
            total=len(items),
        )

    def _conversation(self, run, definition, attempts):
        reason = "当前节点没有可续聊的 agent 运行时"
        point = run.context.get("pause_point", {})
        job = (
            next((j for j in definition.jobs if j.name == run.current_step), None)
            if definition
            else None
        )
        if point.get("reason") == "recovery_requires_review":
            reason = "中断会话未通过恢复身份校验，请使用 revise"
        elif job and job.type == "agent":
            executor = self._runtime().declarative.executors.resolve_agent(job.agent)
            candidate = next((a for a in reversed(attempts) if a.step_name == job.name), None)
            session = point.get("session_id") or (
                candidate.metadata.get("session_id") if candidate else None
            )
            if (
                getattr(executor, "supports_resume", False)
                and candidate
                and session
                and candidate.metadata.get("engine") == getattr(executor, "engine", job.agent)
            ):
                return {"available": True, "reason": None}
            reason = "当前节点缺少匹配的 session 或执行器不支持续聊，请使用 revise"
        return {"available": False, "reason": reason}

    def get_run(self, run_id):
        rt = self._runtime()
        self._load(run_id)
        with rt.store.transaction():
            details = rt.runs.details(run_id)
            persisted_events = rt.store.list_events(run_id)
            try:
                persisted_issue = rt.store.load_issue(
                    details.run.repository_id, details.run.issue_external_id
                )
            except (KeyError, FileNotFoundError):
                persisted_issue = None
        run = details.run
        warnings = []
        try:
            definition = self._definition(run)
        except Exception:
            definition = None
            warnings.append("FROZEN_DEFINITION_UNAVAILABLE")
        summary = self._summary(run, definition, issue=persisted_issue, attempts=details.attempts)
        try:
            issue = persisted_issue
            if issue is None:
                raise KeyError("Issue 不存在")
            issue_summary = bounded_context(
                {
                    "title": issue.title,
                    "body": issue.body,
                    "number": issue.number,
                    "provider": issue.provider,
                }
            )
        except Exception:
            issue_summary = {}
            warnings.append("ISSUE_UNAVAILABLE")
        artifacts = []
        for a in details.artifacts:
            attempt = next(
                (
                    x
                    for x in details.attempts
                    if any(y.artifact_id == a.artifact_id for y in x.artifacts)
                ),
                None,
            )
            artifacts.append(
                Artifact(
                    artifactId=a.artifact_id,
                    name=Path(a.relative_path).name,
                    kind=a.kind,
                    job=a.step_name,
                    stage=attempt.metadata.get("stage") if attempt else None,
                    attemptId=attempt.attempt_id if attempt else None,
                    sha256=a.sha256,
                    size=a.metadata.get("size")
                    if isinstance(a.metadata.get("size"), int)
                    else None,
                    gitRevision=a.git_revision,
                    createdAt=iso(a.created_at),
                    previewable=Path(a.relative_path).suffix.lower() in TEXT_MIMES,
                )
            )
        events = {e.event_id: event_dto(e) for e in persisted_events}
        return RunDetail(
            run=summary,
            issueSummary=issue_summary,
            workflowGraph=graph(definition) if definition else {"stages": [], "loops": []},
            stageExecutions=[timed_dict(s) for s in run.context.get("stage_executions", [])],
            attempts=[attempt_dto(a) for a in details.attempts],
            artifacts=artifacts,
            operations=[
                timed_dict(
                    {
                        "operation_id": o.operation_id,
                        "type": o.operation_type,
                        "status": value(o.status),
                        "external_id": o.external_id,
                        "external_url": safe_url(o.external_url) if o.external_url else None,
                        "created_at": o.created_at,
                        "updated_at": o.updated_at,
                    }
                )
                for o in details.operations
            ],
            events=sorted(events.values(), key=lambda e: (e.createdAt, e.eventId)),
            pausePoint=timed_dict(run.context["pause_point"])
            if run.context.get("pause_point")
            else None,
            feedbackHistory=[timed_dict(x) for x in run.context.get("feedback", [])],
            allowedActions=summary.allowedActions,
            conversation=self._conversation(run, definition, details.attempts),
            debugContext=bounded_context(run.context),
            warnings=warnings,
        )

    def create_run(self, command):
        rt = self._runtime()
        template = self.get_workflow(command.workflowTemplateId)
        if not template.valid:
            raise APIError(422, "WORKFLOW_INVALID", "所选模板未通过校验", template.errors)
        repo = None
        if command.repositoryId is not None:
            if command.repositoryId not in {r.repository_id for r in rt.config.repositories}:
                raise APIError(400, "UNKNOWN_REPOSITORY", "仓库未配置")
            repo = rt.runs.resolve_repository(command.repositoryId)
        source = self._template_source(command.workflowTemplateId)
        run = rt.declarative.submit(source, command.task, repo)
        return self.get_run(run.run_id)

    def control_run(self, run_id, command):
        rt = self._runtime()
        self._load(run_id)
        result = (
            rt.runs.retry(run_id, feedback=command.feedback, mode=command.mode)
            if command.action == "retry"
            else rt.runs.control(
                run_id, command.action, feedback=command.feedback, mode=command.mode
            )
        )
        return self.get_run(result.run_id)

    def _template_source(self, template_id):
        root = Path(self._runtime().config.declarative.directory)
        safe_template(root, template_id)
        try:
            return read_managed_file(root, Path(template_id), TEMPLATE_LIMIT).decode("utf-8")
        except UnicodeDecodeError as exc:
            raise APIError(422, "WORKFLOW_INVALID", "模板必须使用 UTF-8 编码") from exc

    def validate_workflow(self, source):
        if len(source.encode()) > TEMPLATE_LIMIT:
            raise APIError(413, "WORKFLOW_TOO_LARGE", "YAML 超过 1 MiB")
        from dtcoder_agentic_dev.domain.errors import ConfigurationError

        try:
            definition = self._runtime().declarative.parse(source)
            return WorkflowValidation(
                valid=True,
                graph=graph(definition),
                name=definition.name,
                version=definition.version,
            )
        except ConfigurationError as exc:
            return WorkflowValidation(
                valid=False,
                errors=[
                    {"field": "source", "code": "WORKFLOW_INVALID", "message": safe_text(str(exc))}
                ],
            )

    def get_workflow(self, template_id):
        source = self._template_source(template_id)
        validation = self.validate_workflow(source)
        path = safe_template(Path(self._runtime().config.declarative.directory), template_id)
        return WorkflowDetail(
            templateId=template_id,
            name=validation.name or template_id,
            version=validation.version or "",
            description=safe_text(self._runtime().declarative.parse(source).description)
            if validation.valid
            else "",
            stageCount=len(validation.graph.stages) if validation.graph else 0,
            jobCount=sum(len(s.jobs) for s in validation.graph.stages) if validation.graph else 0,
            updatedAt=iso(path.stat().st_mtime),
            valid=validation.valid,
            errors=validation.errors,
            source=safe_text(source, TEMPLATE_LIMIT),
            graph=validation.graph or {"stages": [], "loops": []},
        )

    def list_workflows(self):
        root = Path(self._runtime().config.declarative.directory)
        if not root.is_dir():
            raise unavailable("WORKFLOW_DIRECTORY_UNAVAILABLE", "模板目录不可达")
        result = []
        for path in sorted(root.iterdir()):
            if (
                path.is_file()
                and not path.is_symlink()
                and path.suffix.lower() in {".yaml", ".yml"}
            ):
                detail = self.get_workflow(path.name)
                result.append(WorkflowSummary(**detail.model_dump(exclude={"source", "graph"})))
        return result

    def list_repositories(self):
        rt = self._runtime()
        return [
            RepositorySummary(
                repositoryId=r.repository_id,
                name=safe_text(r.name),
                provider=safe_text(r.provider),
                project=safe_text(r.project),
                remote=safe_url(r.remote),
                baseBranch=r.base_branch,
                pipelineEnabled=r.pipeline_enabled,
                capability="CONFIGURED" if r.provider != "logging" else "OFFLINE",
            )
            for r in rt.config.repositories
        ]

    def _artifact(self, run_id, artifact_id, limit):
        run = self._load(run_id)
        record = next(
            (
                a
                for a in self._runtime().store.list_artifacts(run_id)
                if a.artifact_id == artifact_id and a.run_id == run_id
            ),
            None,
        )
        if not record:
            raise not_found("产物")
        if not run.workspace_path:
            raise not_found("工作区")
        root = Path(os.path.abspath(self._runtime().config.workspace.workspaces))
        workspace = Path(os.path.abspath(run.workspace_path))
        try:
            workspace_relative = workspace.relative_to(root)
        except ValueError as exc:
            raise APIError(403, "UNSAFE_PATH", "工作区超出受管范围") from exc
        artifact_relative = Path(record.relative_path)
        if artifact_relative.is_absolute() or ".." in artifact_relative.parts:
            raise APIError(403, "UNSAFE_PATH", "产物路径超出受管范围")
        data = read_managed_file(root, workspace_relative / artifact_relative, limit)
        return record, data

    def read_artifact(self, run_id, artifact_id):
        # 二进制内容绝不进入文本预览；只返回元信息。
        records = self._runtime().store.list_artifacts(run_id)
        record = next(
            (a for a in records if a.artifact_id == artifact_id and a.run_id == run_id), None
        )
        if not record:
            raise not_found("产物")
        mime = TEXT_MIMES.get(Path(record.relative_path).suffix.lower())
        record, data = self._artifact(
            run_id, artifact_id, PREVIEW_LIMIT if mime else DOWNLOAD_LIMIT
        )
        content = None
        if mime:
            try:
                content = safe_text(data.decode("utf-8"), PREVIEW_LIMIT)
                if "\x00" in content:
                    content = None
            except UnicodeDecodeError:
                pass
        return ArtifactContent(
            name=Path(record.relative_path).name,
            mime=mime or "application/octet-stream",
            content=content,
            size=len(data),
            previewable=content is not None,
        )

    def download_artifact(self, run_id, artifact_id):
        record, data = self._artifact(run_id, artifact_id, DOWNLOAD_LIMIT)
        if Path(record.relative_path).suffix.lower() in TEXT_MIMES:
            try:
                data = safe_text(data.decode("utf-8"), DOWNLOAD_LIMIT).encode()
            except UnicodeDecodeError:
                pass
        return Path(record.relative_path).name, data
