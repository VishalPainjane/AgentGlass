"""
AgentGlass End-to-End Smoke Test

Validates the full local telemetry pipeline:
  SDK → Daemon (HTTP ingest) → SQLite → REST query

Usage:
    1. Start the daemon: pnpm dev:daemon
    2. Run this test: python -m pytest sdk-python/tests/smoke_test.py -v
"""

from __future__ import annotations

import time
from uuid import uuid4

import httpx
import pytest

from agentglass_python import AgentGlassClient, AgentGlassEvent


DAEMON_URL = "http://127.0.0.1:7777"


def _wait_for_daemon(timeout: float = 5.0) -> bool:
    """Wait for the daemon to be reachable."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            r = httpx.get(f"{DAEMON_URL}/health", timeout=1.0)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(0.3)
    return False


@pytest.fixture(scope="module")
def daemon_ready():
    """Ensure daemon is running before tests execute."""
    if not _wait_for_daemon():
        pytest.skip("AgentGlass daemon not running at localhost:7777")


@pytest.fixture
def client():
    c = AgentGlassClient(daemon_url=DAEMON_URL, flush_interval_ms=100, max_batch_size=20)
    yield c
    c.close()


def test_health_endpoint(daemon_ready):
    """Daemon health endpoint responds with 200."""
    r = httpx.get(f"{DAEMON_URL}/health", timeout=2.0)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"


def test_ingest_single_event(daemon_ready, client):
    """Single event can be ingested and queried back."""
    trace_id = str(uuid4())
    span_id = str(uuid4())

    client.track(
        AgentGlassEvent(
            trace_id=trace_id,
            span_id=span_id,
            event_type="agent_start",
            node_name="test_node",
            payload={"test": True},
        )
    )

    # Wait for flush
    time.sleep(0.5)
    client.close()

    # Query back
    r = httpx.get(f"{DAEMON_URL}/v1/traces/{trace_id}/events", timeout=2.0)
    assert r.status_code == 200
    data = r.json()
    events = data["events"]
    assert len(events) >= 1
    assert events[0]["trace_id"] == trace_id
    assert events[0]["node_name"] == "test_node"


def test_multi_agent_simulation(daemon_ready, client):
    """Simulate a multi-agent LangGraph run and verify trace integrity."""
    trace_id = str(uuid4())
    orchestrator_span = str(uuid4())
    research_span = str(uuid4())
    search_span = str(uuid4())
    writer_span = str(uuid4())

    events = [
        # Orchestrator starts
        AgentGlassEvent(
            trace_id=trace_id,
            span_id=orchestrator_span,
            event_type="agent_start",
            node_name="orchestrator",
            payload={"name": "orchestrator"},
        ),
        # Research agent starts (child of orchestrator)
        AgentGlassEvent(
            trace_id=trace_id,
            span_id=research_span,
            parent_span_id=orchestrator_span,
            event_type="agent_start",
            node_name="research_agent",
            payload={"name": "research_agent"},
        ),
        # Tool call from research agent
        AgentGlassEvent(
            trace_id=trace_id,
            span_id=search_span,
            parent_span_id=research_span,
            event_type="tool_call",
            node_name="web_search",
            payload={"query": "LLM observability 2026"},
        ),
        # Tool result
        AgentGlassEvent(
            trace_id=trace_id,
            span_id=search_span,
            parent_span_id=research_span,
            event_type="tool_result",
            node_name="web_search",
            payload={"results": ["paper1", "paper2"]},
        ),
        # Research agent ends
        AgentGlassEvent(
            trace_id=trace_id,
            span_id=research_span,
            parent_span_id=orchestrator_span,
            event_type="agent_end",
            node_name="research_agent",
            payload={"name": "research_agent"},
        ),
        # Writer agent starts (child of orchestrator)
        AgentGlassEvent(
            trace_id=trace_id,
            span_id=writer_span,
            parent_span_id=orchestrator_span,
            event_type="agent_start",
            node_name="writer_agent",
            payload={"name": "writer_agent"},
        ),
        # LLM request
        AgentGlassEvent(
            trace_id=trace_id,
            span_id=writer_span,
            parent_span_id=orchestrator_span,
            event_type="llm_request",
            node_name="writer_agent",
            payload={"model": "gemini-2.0-flash", "prompt": "Summarize findings"},
        ),
        # LLM response
        AgentGlassEvent(
            trace_id=trace_id,
            span_id=writer_span,
            parent_span_id=orchestrator_span,
            event_type="llm_response",
            node_name="writer_agent",
            payload={"response": "The research indicates..."},
        ),
        # Writer agent ends
        AgentGlassEvent(
            trace_id=trace_id,
            span_id=writer_span,
            parent_span_id=orchestrator_span,
            event_type="agent_end",
            node_name="writer_agent",
            payload={"name": "writer_agent"},
        ),
        # Orchestrator ends
        AgentGlassEvent(
            trace_id=trace_id,
            span_id=orchestrator_span,
            event_type="agent_end",
            node_name="orchestrator",
            payload={"name": "orchestrator"},
        ),
    ]

    for event in events:
        client.track(event)

    # Wait for flush
    time.sleep(1.0)
    client.close()

    # Verify trace exists in trace list
    r = httpx.get(f"{DAEMON_URL}/v1/traces", timeout=2.0)
    assert r.status_code == 200
    traces = r.json()["traces"]
    matching = [t for t in traces if t["trace_id"] == trace_id]
    assert len(matching) == 1
    assert matching[0]["event_count"] == 10

    # Verify all events retrievable
    r = httpx.get(f"{DAEMON_URL}/v1/traces/{trace_id}/events", timeout=2.0)
    assert r.status_code == 200
    retrieved_events = r.json()["events"]
    assert len(retrieved_events) == 10

    # Verify event ordering (timestamps should be non-decreasing)
    timestamps = [e["timestamp"] for e in retrieved_events]
    assert timestamps == sorted(timestamps)

    # Verify parent-child relationships
    research_events = [e for e in retrieved_events if e["node_name"] == "research_agent"]
    for e in research_events:
        assert e["parent_span_id"] == orchestrator_span


def test_error_event_flagging(daemon_ready, client):
    """Error events should flag the trace with has_error."""
    trace_id = str(uuid4())
    span_id = str(uuid4())

    client.track(
        AgentGlassEvent(
            trace_id=trace_id,
            span_id=span_id,
            event_type="agent_start",
            node_name="failing_agent",
        )
    )

    client.track(
        AgentGlassEvent(
            trace_id=trace_id,
            span_id=span_id,
            event_type="error",
            node_name="failing_agent",
            payload={"message": "Hallucination detected"},
        )
    )

    time.sleep(0.5)
    client.close()

    r = httpx.get(f"{DAEMON_URL}/v1/traces", timeout=2.0)
    traces = r.json()["traces"]
    matching = [t for t in traces if t["trace_id"] == trace_id]
    assert len(matching) == 1
    assert matching[0]["has_error"] is True


def test_schema_validation_rejects_invalid(daemon_ready):
    """Daemon should reject events missing required fields."""
    r = httpx.post(
        f"{DAEMON_URL}/v1/events",
        json={"bad": "data"},
        timeout=2.0,
    )
    assert r.status_code == 400
    assert "error" in r.json()
