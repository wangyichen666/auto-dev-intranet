import pytest
from fastapi.testclient import TestClient

from auto_dev_intranet.app import create_app
from auto_dev_intranet.upstream import UpstreamGateway
from tests.fake_gateway import SOURCE, FakeGateway


@pytest.fixture
def fake():
    return FakeGateway()


@pytest.fixture
def client(fake):
    with TestClient(
        create_app(fake, token="test-token"), headers={"Authorization": "Bearer test-token"}
    ) as c:
        yield c


def create(client, **kwargs):
    return client.post(
        "/api/v1/runs", json={"task": "测试任务", "workflowTemplateId": "document.yaml", **kwargs}
    )


def test_auth_default_deny():
    c = TestClient(create_app(FakeGateway(), token=""))
    assert c.get("/api/v1/health").status_code == 401
    assert c.post("/api/v1/runs", json={}).json()["error"]["requestId"]


def test_upstream_unavailable():
    c = TestClient(
        create_app(UpstreamGateway("/nonexistent/config.yaml"), token="x"),
        headers={"Authorization": "Bearer x"},
    )
    assert not c.get("/api/v1/health").json()["upstreamAvailable"]
    response = c.get("/api/v1/runs")
    assert response.status_code == 503
    assert "/nonexistent" not in response.text


@pytest.mark.parametrize("repo", [None, "repo-1"])
def test_create_detail(client, fake, repo):
    r = create(client, repositoryId=repo)
    assert r.status_code == 201
    d = r.json()
    assert d["run"]["status"] == "QUEUED"
    assert d["run"]["repositoryMode"] == ("single" if repo else "none")
    for key in (
        "issueSummary",
        "workflowGraph",
        "stageExecutions",
        "attempts",
        "artifacts",
        "operations",
        "events",
        "pausePoint",
        "feedbackHistory",
        "allowedActions",
    ):
        assert key in d
    assert client.get("/api/v1/runs/unknown").status_code == 404


def test_filters_sort_page(client):
    for task in ("Alpha", "Beta", "Gamma"):
        create(client, task=task)
    r = client.get("/api/v1/runs?pageSize=2").json()
    assert r["total"] == 3 and len(r["items"]) == 2
    assert r["items"][0]["runId"] == "test-run-003"
    assert client.get("/api/v1/runs?query=beta").json()["total"] == 1
    assert client.get("/api/v1/runs?status=FAILED").json()["total"] == 0
    assert client.get("/api/v1/runs?page=9").json()["items"] == []
    assert client.get("/api/v1/runs?page=0").status_code == 400
    assert client.get("/api/v1/runs?pageSize=101").status_code == 400


@pytest.mark.parametrize(
    "fields,code",
    [
        ({"workflowTemplateId": "bad.yaml"}, 404),
        ({"repositoryId": "bad"}, 400),
        ({"task": " "}, 400),
        ({"task": "x" * 20001}, 400),
    ],
)
def test_create_validation(client, fields, code):
    assert create(client, **fields).status_code == code


def test_large_body(client):
    assert client.post("/api/v1/workflows/validate", content="x" * 1200000).status_code == 413
    assert (
        client.post("/api/v1/workflows/validate", json={"source": "中" * 400000}).status_code == 413
    )


def test_actions_and_feedback(client, fake):
    run_id = create(client).json()["run"]["runId"]
    url = f"/api/v1/runs/{run_id}/actions"
    assert client.post(url, json={"action": "resume"}).status_code == 409
    assert client.post(url, json={"action": "skip"}).status_code == 409
    assert client.post(url, json={"action": "pause"}).json()["run"]["status"] == "PAUSED"
    assert (
        client.post(url, json={"action": "resume", "mode": "continue_conversation"}).status_code
        == 409
    )
    r = client.post(url, json={"action": "resume", "feedback": "补充测试", "mode": "revise"})
    assert r.json()["feedbackHistory"][0]["text"] == "补充测试"
    fake.conflict = True
    assert (
        client.post(url, json={"action": "pause"}).json()["error"]["code"] == "CONCURRENCY_CONFLICT"
    )
    fake.conflict = False
    assert client.post(url, json={"action": "cancel"}).json()["run"]["status"] == "CANCELLED"
    assert client.post(url, json={"action": "retry"}).json()["run"]["status"] == "QUEUED"
    assert client.post(url, json={"action": "wat"}).status_code == 400


def test_workflows(client):
    assert client.get("/api/v1/workflows").json()[0]["valid"]
    assert client.get("/api/v1/workflows/document.yaml").json()["source"]
    assert client.post("/api/v1/workflows/validate", json={"source": SOURCE}).json()["valid"]
    r = client.post("/api/v1/workflows/validate", json={"source": "name: x\nname: y"})
    assert r.status_code == 422 and r.json()["error"]["details"]


def test_artifacts_and_events(client, fake):
    run_id = create(client).json()["run"]["runId"]
    fake.complete(run_id)
    root = f"/api/v1/runs/{run_id}"
    assert len(client.get(root + "/events").json()) == 1
    assert client.get(root + "/artifacts/artifact-1/content").json()["previewable"]
    r = client.get(root + "/artifacts/artifact-1/download")
    assert "attachment" in r.headers["content-disposition"]
    assert client.get(root + "/artifacts/other/content").status_code == 404


def test_spa_api_boundary(tmp_path):
    (tmp_path / "index.html").write_text("<html>SPA</html>")
    c = TestClient(
        create_app(FakeGateway(), token="x", static_dir=tmp_path),
        headers={"Authorization": "Bearer x"},
    )
    assert c.get("/tasks/123").text == "<html>SPA</html>"
    assert c.get("/api/unknown").status_code == 404
    assert c.get("/assets/missing.js").status_code == 404
    assert c.get("/api/v1/openapi.json").status_code == 200
