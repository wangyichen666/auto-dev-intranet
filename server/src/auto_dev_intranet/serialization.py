from dataclasses import asdict
from datetime import datetime, timezone
from enum import Enum

from .schemas import Attempt, Event, Job, Stage, WorkflowGraph
from .security import bounded_context, redact, safe_text


def iso(value):
    if value is None:
        return None
    return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")


def value(enum):
    return enum.value if isinstance(enum, Enum) else enum


def graph(definition):
    return WorkflowGraph(
        stages=[
            Stage(
                name=stage,
                jobs=[
                    Job(
                        name=j.name,
                        type=j.type,
                        agent=j.agent if j.type == "agent" else None,
                        tool=j.tool_name,
                        model=j.model,
                        allowSkip=j.policy.allow_skip,
                    )
                    for j in definition.jobs
                    if j.stage == stage
                ],
            )
            for stage in definition.stages
        ],
        loops=redact([asdict(loop) for loop in definition.loops]),
    )


def attempt_dto(a):
    execution = a.output.get("facts", {}).get("execution", {})
    return Attempt(
        attemptId=a.attempt_id,
        job=a.step_name,
        stage=a.metadata.get("stage"),
        round=a.metadata.get("round", 1),
        number=a.attempt_number,
        status=value(a.status),
        engine=a.metadata.get("engine") or execution.get("engine"),
        model=a.metadata.get("model") or execution.get("model"),
        hasSession=bool(a.metadata.get("session_id") or execution.get("session_id")),
        startedAt=iso(a.started_at),
        finishedAt=iso(a.finished_at),
        errorCode=a.error_code,
        errorMessage=safe_text(a.error_message) if a.error_message else None,
        stdout=safe_text(str(execution.get("stdout", "")), 2048),
        stderr=safe_text(str(execution.get("stderr", "")), 2048),
        artifactIds=[x.artifact_id for x in a.artifacts],
    )


def event_dto(e):
    return Event(
        eventId=e.event_id,
        type=value(e.type),
        step=e.step,
        createdAt=iso(e.created_at),
        payload=bounded_context(e.payload),
    )


def timed_dict(data):
    result = bounded_context(data)
    for key in ("created_at", "updated_at", "started_at", "finished_at"):
        if isinstance(result.get(key), (int, float)):
            result[key] = iso(result[key])
    return result
