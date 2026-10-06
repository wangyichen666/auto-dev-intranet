"""在临时状态目录核验固定版本真实组合根；不启动 agent、不联网、不碰用户仓库。"""

from pathlib import Path

import pytest
from dtcoder_agentic_dev.application.services.initialization import initialize
from dtcoder_agentic_dev.config import RepoConfig
from dtcoder_agentic_dev.domain.models import Artifact

from auto_dev_intranet.errors import APIError
from auto_dev_intranet.schemas import CreateRunCommand, RunActionCommand, RunFilters
from auto_dev_intranet.security import bounded_context, read_managed_file, safe_template, safe_url
from auto_dev_intranet.upstream import UpstreamGateway


@pytest.fixture
def gw(tmp_path):
    path = tmp_path / "config.yaml"
    initialize(path)
    gateway = UpstreamGateway(str(path))
    yield gateway
    gateway.close()


def submit(gw, repo=None):
    return gw.create_run(
        CreateRunCommand(
            task="真实适配层契约测试", workflowTemplateId="document.yaml", repositoryId=repo
        )
    )


def test_real_queue_query_control(gw):
    d = submit(gw)
    assert d.run.status.value == "QUEUED" and not d.attempts
    assert d.workflowGraph.stages[0].jobs[0].name == "document"
    assert gw.list_runs(RunFilters(query="契约测试")).total == 1
    paused = gw.control_run(d.run.runId, RunActionCommand(action="pause"))
    assert paused.run.status.value == "PAUSED"
    assert not paused.conversation["available"]
    resumed = gw.control_run(d.run.runId, RunActionCommand(action="resume", feedback="补充说明"))
    assert resumed.run.status.value == "QUEUED"
    assert resumed.feedbackHistory[0]["text"] == "补充说明"
    cancelled = gw.control_run(d.run.runId, RunActionCommand(action="cancel"))
    assert cancelled.run.status.value == "CANCELLED"
    assert (
        gw.control_run(d.run.runId, RunActionCommand(action="retry")).run.status.value == "QUEUED"
    )
    assert gw.health().upstreamAvailable


def test_real_single_repo_and_unknown(gw):
    rt = gw._runtime()
    repo = RepoConfig(name="测试配置", remote="https://example.invalid/test.git")
    rt.config.repositories.append(repo)
    d = submit(gw, repo.repository_id)
    assert d.run.repositoryMode == "single" and d.run.branch
    with pytest.raises(APIError) as e:
        submit(gw, "not-configured")
    assert e.value.code == "UNKNOWN_REPOSITORY"


def test_real_illegal_actions_lease(gw):
    from dtcoder_agentic_dev.domain.errors import ConcurrencyConflict, ConfigurationError

    d = submit(gw)
    with pytest.raises(ConfigurationError):
        gw.control_run(d.run.runId, RunActionCommand(action="resume"))
    gw.control_run(d.run.runId, RunActionCommand(action="pause"))
    with pytest.raises(ConfigurationError):
        gw.control_run(d.run.runId, RunActionCommand(action="skip"))
    rt = gw._runtime()
    gw.control_run(d.run.runId, RunActionCommand(action="resume"))
    rt.store.claim_run("test-owner", rt.declarative.clock.now(), 120, d.run.runId)
    gw.control_run(d.run.runId, RunActionCommand(action="pause"))
    with pytest.raises(ConcurrencyConflict):
        gw.control_run(d.run.runId, RunActionCommand(action="resume"))


def test_legacy_payload(gw):
    from dtcoder_agentic_dev.domain.models import Issue, WorkflowRun

    rt = gw._runtime()
    rt.store.save_issue(Issue("local", "", "legacy", 1, "旧任务"))
    rt.store.create_run(WorkflowRun("legacy", "old", "1", "", "legacy", 1))
    d = gw.get_run("legacy")
    assert not d.workflowGraph.stages and not d.attempts and not d.stageExecutions
    assert d.run.title == "旧任务"


def test_real_artifact_boundaries(gw, tmp_path):
    d = submit(gw)
    rt = gw._runtime()
    workspace = Path(rt.config.workspace.workspaces) / d.run.runId
    workspace.mkdir(parents=True)
    (workspace / "report.md").write_text("# 产物\npassword=secret-value", encoding="utf-8")
    run = rt.store.load_run(d.run.runId)
    run.workspace_path = str(workspace)
    rt.store.update_run(run)
    record = Artifact("a1", run.run_id, "document", "markdown", "report.md", "a" * 64)
    rt.store.save_artifact(record)
    c = gw.read_artifact(run.run_id, "a1")
    assert c.previewable and "secret-value" not in c.content
    assert "secret-value" not in gw.download_artifact(run.run_id, "a1")[1].decode()
    other = submit(gw)
    with pytest.raises(APIError) as e:
        gw.read_artifact(other.run.runId, "a1")
    assert e.value.status == 404
    record.relative_path = "../config.yaml"
    rt.store.save_artifact(record)
    with pytest.raises(APIError) as e:
        gw.read_artifact(run.run_id, "a1")
    assert e.value.status == 403
    (workspace / "escape.md").symlink_to(tmp_path / "config.yaml")
    record.relative_path = "escape.md"
    rt.store.save_artifact(record)
    with pytest.raises(APIError) as e:
        gw.read_artifact(run.run_id, "a1")
    assert e.value.status == 403
    (workspace / "large.txt").write_bytes(b"x" * (256 * 1024 + 1))
    record.relative_path = "large.txt"
    rt.store.save_artifact(record)
    with pytest.raises(APIError) as e:
        gw.read_artifact(run.run_id, "a1")
    assert e.value.status == 413
    assert len(gw.download_artifact(run.run_id, "a1")[1]) == 256 * 1024 + 1
    (workspace / "binary.bin").write_bytes(b"\x00\xff")
    record.relative_path = "binary.bin"
    rt.store.save_artifact(record)
    assert not gw.read_artifact(run.run_id, "a1").previewable
    run.workspace_path = None
    rt.store.update_run(run)
    with pytest.raises(APIError) as e:
        gw.read_artifact(run.run_id, "a1")
    assert e.value.status == 404


@pytest.mark.parametrize(
    "template", ["../a.yaml", "/a.yaml", "a.txt", "..yaml", "dir/a.yml", "dir\\a.yaml"]
)
def test_template_ids(gw, template):
    with pytest.raises(APIError):
        gw.get_workflow(template)


def test_template_symlink_and_strict_validation(gw, tmp_path):
    root = Path(gw._runtime().config.declarative.directory)
    (root / "escape.yaml").symlink_to(tmp_path / "config.yaml")
    with pytest.raises(APIError):
        safe_template(root, "escape.yaml")
    assert not gw.validate_workflow("name: one\nname: two").valid
    assert not gw.validate_workflow("!!python/object/apply:os.system ['echo unsafe']").valid
    assert not gw.validate_workflow("unknown: true").valid
    assert all(w.valid for w in gw.list_workflows())


def test_redaction_and_parent_symlink(tmp_path):
    secret = {
        "authorization": "Bearer abc",
        "nested": {"AK": "123", "token": "456"},
        "url": "https://user:pass@example.com/path?token=123",
        "path": "/Users/me/private/file",
    }
    result = str(bounded_context(secret))
    assert (
        "abc" not in result
        and "123" not in result
        and "456" not in result
        and "/Users/me" not in result
    )
    assert safe_url("https://user:pass@example.com/a?q=secret") == "https://example.com/a"
    assert bounded_context({"large": ["x" * 9000] * 100}) == {"truncated": True}
    real = tmp_path / "real"
    real.mkdir()
    (real / "file.txt").write_text("test")
    (tmp_path / "link").symlink_to(real, target_is_directory=True)
    with pytest.raises(APIError):
        read_managed_file(tmp_path / "link", Path("file.txt"), 100)


def test_real_skip_and_available_conversation(gw):
    from dtcoder_agentic_dev.domain.models import AttemptStatus, StepAttempt

    root = Path(gw._runtime().config.declarative.directory)
    source = """name: approval
version: '1'
stages: [write]
jobs:
  write:
    stage: write
    agent: codex-cli
    prompt: 编写文档
    config:
      execute: {humanAgentType: approval, allow_skip: true}
"""
    (root / "approval.yaml").write_text(source, encoding="utf-8")
    d = gw.create_run(CreateRunCommand(task="控制契约测试", workflowTemplateId="approval.yaml"))
    gw.control_run(d.run.runId, RunActionCommand(action="pause"))
    assert "skip" in gw.get_run(d.run.runId).allowedActions
    rt = gw._runtime()
    rt.store.save_attempt(
        StepAttempt(
            "session-attempt",
            d.run.runId,
            "write",
            1,
            status=AttemptStatus.PAUSED,
            metadata={"engine": "codex-cli", "session_id": "test-session"},
        )
    )
    assert gw.get_run(d.run.runId).conversation["available"]
    resumed = gw.control_run(
        d.run.runId,
        RunActionCommand(action="resume", mode="continue_conversation", feedback="续聊反馈"),
    )
    assert resumed.run.status.value == "QUEUED"
    assert resumed.debugContext["agent_resume"]["mode"] == "continue_conversation"
    gw.control_run(d.run.runId, RunActionCommand(action="pause"))
    assert gw.control_run(d.run.runId, RunActionCommand(action="skip")).run.status.value == "QUEUED"


def test_artifact_workspace_escape_and_nonregular(gw, tmp_path):
    d = submit(gw)
    rt = gw._runtime()
    run = rt.store.load_run(d.run.runId)
    record = Artifact("file-1", run.run_id, "document", "file", "bad.txt", "a" * 64)
    rt.store.save_artifact(record)
    run.workspace_path = str(tmp_path / "outside")
    rt.store.update_run(run)
    with pytest.raises(APIError) as error:
        gw.read_artifact(run.run_id, "file-1")
    assert error.value.status == 403
    workspace = Path(rt.config.workspace.workspaces) / run.run_id
    workspace.mkdir(parents=True)
    (workspace / "bad.txt").mkdir()
    run.workspace_path = str(workspace)
    rt.store.update_run(run)
    with pytest.raises(APIError) as error:
        gw.read_artifact(run.run_id, "file-1")
    assert error.value.status == 403
