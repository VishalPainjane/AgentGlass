"""
AgentGlass — Comprehensive End-to-End Stress Test

This script simulates a REALISTIC multi-agent customer-support pipeline that:
  1. Receives a user complaint
  2. Runs a Router agent to classify intent
  3. Dispatches to a RefundAgent OR EscalationAgent (conditional branching)
  4. The chosen agent calls tools (DB lookup, Stripe refund, email)
  5. A Summarizer agent produces the final response
  6. An intentional ERROR is injected on one path to test error rendering
  7. A LARGE payload (>10KB) is emitted to test blob offloading
  8. The SAME batch is sent twice to test idempotency/dedup
  9. REST API verification: health, traces list, trace events, blob fetch
 10. State injection poll verification (non-blocking check)

Covers: ingestion, WebSocket broadcast, graph rendering, time-travel data,
        blob offloading, idempotency, error nodes, REST endpoints.

Prerequisites:
    1. Daemon running on :7777
    2. Dashboard running on :3000
    3. pip install -e sdk-python
    4. python sdk-python/examples/e2e_stress_test.py
"""

from __future__ import annotations

import json
import sys
import time
from uuid import uuid4

import httpx

from agentglass_python import AgentGlassClient, AgentGlassEvent


DAEMON = "http://127.0.0.1:7777"
PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
WARN = "\033[93mWARN\033[0m"

results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    tag = PASS if ok else FAIL
    extra = f"  ({detail})" if detail else ""
    print(f"  [{tag}] {name}{extra}")


# ── 0) Pre-flight: Is the daemon alive? ─────────────────────────────────
def test_health() -> bool:
    print("\n=== TEST 0: Daemon Health Check ===")
    try:
        r = httpx.get(f"{DAEMON}/health", timeout=3)
        data = r.json()
        alive = r.status_code == 200 and data.get("status") == "ok"
        record("GET /health returns 200", alive, json.dumps(data))
        return alive
    except Exception as e:
        record("GET /health reachable", False, str(e))
        return False


# ── 1) Realistic multi-agent pipeline ───────────────────────────────────
def test_pipeline(client: AgentGlassClient) -> str:
    """Emit a complete customer-support pipeline and return its trace_id."""
    print("\n=== TEST 1: Realistic Multi-Agent Pipeline ===")

    trace_id = str(uuid4())
    router_id = str(uuid4())
    refund_id = str(uuid4())
    escalation_id = str(uuid4())
    summarizer_id = str(uuid4())
    db_tool_id = str(uuid4())
    stripe_tool_id = str(uuid4())
    email_tool_id = str(uuid4())

    events_sent = 0

    def emit(etype: str, sid: str, name: str,
             parent: str | None = None, payload: dict | None = None) -> None:
        nonlocal events_sent
        client.track(AgentGlassEvent(
            trace_id=trace_id,
            span_id=sid,
            parent_span_id=parent,
            event_type=etype,
            node_name=name,
            payload=payload or {},
        ))
        events_sent += 1
        time.sleep(0.15)

    # Router
    emit("agent_start", router_id, "IntentRouter", payload={
        "user_message": "I was charged $49.99 twice for my subscription. Please fix this.",
        "session_id": "sess_abc123",
    })
    emit("llm_request", router_id, "IntentRouter", payload={
        "model": "gpt-4o-mini",
        "prompt": "Classify the following user message into: refund, escalation, general_query...",
        "temperature": 0.0,
    })
    emit("llm_response", router_id, "IntentRouter", payload={
        "model": "gpt-4o-mini",
        "classification": "refund",
        "confidence": 0.97,
        "tokens": {"input": 312, "output": 18},
    })
    emit("agent_end", router_id, "IntentRouter", payload={
        "decision": "route_to_refund_agent",
        "reason": "High-confidence refund intent detected",
    })

    # Refund Agent
    emit("agent_start", refund_id, "RefundAgent", parent=router_id, payload={
        "task": "Process double-charge refund for user sess_abc123",
    })

    # Tool: DB Lookup
    emit("tool_call", db_tool_id, "db_lookup", parent=refund_id, payload={
        "tool_name": "db_lookup",
        "query": "SELECT * FROM charges WHERE session_id='sess_abc123' AND amount=49.99",
    })
    emit("tool_result", db_tool_id, "db_lookup", parent=refund_id, payload={
        "tool_name": "db_lookup",
        "rows": [
            {"charge_id": "ch_001", "amount": 49.99, "status": "succeeded", "created": "2026-04-20"},
            {"charge_id": "ch_002", "amount": 49.99, "status": "succeeded", "created": "2026-04-20"},
        ],
        "duplicate_confirmed": True,
    })

    # Tool: Stripe Refund
    emit("tool_call", stripe_tool_id, "stripe_refund", parent=refund_id, payload={
        "tool_name": "stripe_refund",
        "charge_id": "ch_002",
        "amount": 49.99,
        "reason": "duplicate_charge",
    })
    emit("tool_result", stripe_tool_id, "stripe_refund", parent=refund_id, payload={
        "tool_name": "stripe_refund",
        "refund_id": "re_xyz789",
        "status": "succeeded",
        "amount_refunded": 49.99,
    })

    # State snapshot mid-refund
    emit("state_snapshot", refund_id, "RefundAgent", parent=router_id, payload={
        "state": {
            "charges_found": 2,
            "duplicate_confirmed": True,
            "refund_issued": True,
            "refund_id": "re_xyz789",
        },
        "checkpoint": "post_refund",
    })

    emit("agent_end", refund_id, "RefundAgent", parent=router_id, payload={
        "result": "Refund of $49.99 issued successfully (re_xyz789)",
    })

    # Escalation Agent (runs in parallel in a real system — here sequential)
    emit("agent_start", escalation_id, "EscalationAgent", parent=router_id, payload={
        "task": "Flag account for review due to duplicate charge pattern",
    })
    # Intentional ERROR to test error rendering
    emit("error", escalation_id, "EscalationAgent", parent=router_id, payload={
        "error_type": "ExternalServiceTimeout",
        "message": "Zendesk API timed out after 30s while creating ticket",
        "traceback": "Traceback (most recent call last):\n  File \"agents/escalation.py\", line 42\n    resp = zendesk.create_ticket(...)\nTimeoutError: Connection timed out",
        "retries_attempted": 3,
    })

    # Email tool from the refund path
    emit("tool_call", email_tool_id, "send_email", parent=refund_id, payload={
        "tool_name": "send_email",
        "to": "customer@example.com",
        "subject": "Your refund has been processed",
        "template": "refund_confirmation",
    })
    emit("tool_result", email_tool_id, "send_email", parent=refund_id, payload={
        "tool_name": "send_email",
        "message_id": "msg_email_001",
        "status": "delivered",
    })

    # Summarizer
    emit("agent_start", summarizer_id, "Summarizer", parent=router_id, payload={
        "task": "Generate customer-facing summary of actions taken",
    })
    emit("llm_request", summarizer_id, "Summarizer", parent=router_id, payload={
        "model": "gemini-2.5-pro",
        "prompt": "Summarize the following actions taken for the customer...",
        "context_tokens": 2100,
    })
    emit("llm_response", summarizer_id, "Summarizer", parent=router_id, payload={
        "model": "gemini-2.5-pro",
        "response": "Hi there! We found and confirmed the duplicate charge of $49.99. A refund (re_xyz789) has been issued and should appear in 3-5 business days. We also attempted to flag your account for a courtesy review, but encountered a temporary issue with our ticketing system. Rest assured, our team will follow up manually. Thank you for your patience!",
        "tokens": {"input": 2100, "output": 680},
    })
    emit("agent_end", summarizer_id, "Summarizer", parent=router_id, payload={
        "final_response": "Refund processed, customer notified, escalation partially failed.",
    })

    # Flush
    time.sleep(1.0)
    client.close()

    record("Pipeline events emitted", events_sent == 19, f"{events_sent} events")
    return trace_id


# ── 2) REST API: Verify trace appeared ──────────────────────────────────
def test_rest_traces(trace_id: str) -> None:
    print("\n=== TEST 2: REST API — Trace Listing ===")
    r = httpx.get(f"{DAEMON}/v1/traces", timeout=5)
    data = r.json()
    traces = data.get("traces", [])
    found = any(t["trace_id"] == trace_id for t in traces)
    record("GET /v1/traces lists our trace", found, f"{len(traces)} traces total")


# ── 3) REST API: Verify event count for trace ──────────────────────────
def test_rest_events(trace_id: str) -> int:
    print("\n=== TEST 3: REST API — Trace Events ===")
    r = httpx.get(f"{DAEMON}/v1/traces/{trace_id}/events", timeout=5)
    data = r.json()
    events = data.get("events", [])
    record("GET /v1/traces/:id/events returns events", len(events) >= 18,
           f"{len(events)} events returned")

    # Check event types we expect
    types = [e["event_type"] for e in events]
    has_error = "error" in types
    has_snapshot = "state_snapshot" in types
    has_tool = "tool_call" in types and "tool_result" in types
    has_llm = "llm_request" in types and "llm_response" in types
    record("Contains error event", has_error)
    record("Contains state_snapshot", has_snapshot)
    record("Contains tool_call + tool_result", has_tool)
    record("Contains llm_request + llm_response", has_llm)

    # Verify node names
    names = set(e["node_name"] for e in events)
    for expected in ["IntentRouter", "RefundAgent", "EscalationAgent", "Summarizer",
                     "db_lookup", "stripe_refund", "send_email"]:
        record(f"Node '{expected}' present", expected in names)

    return len(events)


# ── 4) Blob offloading ──────────────────────────────────────────────────
def test_blob_offload() -> None:
    print("\n=== TEST 4: Blob Payload Offloading ===")
    # Send a payload larger than the 10KB threshold
    big_payload = {
        "full_conversation_history": [
            {"role": "user", "content": f"Message {i}: " + "x" * 200}
            for i in range(60)  # ~15KB of conversation
        ],
        "embeddings": [0.123456] * 500,
    }
    big_trace = str(uuid4())
    big_span = str(uuid4())

    event = {
        "trace_id": big_trace,
        "span_id": big_span,
        "event_type": "llm_request",
        "node_name": "BigContextAgent",
        "payload": big_payload,
    }

    r = httpx.post(f"{DAEMON}/v1/events", json=event, timeout=5)
    record("POST large payload accepted", r.status_code == 202)

    time.sleep(0.5)

    # Fetch the event back and check if payload was blobified
    r2 = httpx.get(f"{DAEMON}/v1/traces/{big_trace}/events", timeout=5)
    events = r2.json().get("events", [])
    if events:
        payload = events[0].get("payload", {})
        is_blob = "$blob" in payload
        record("Payload was offloaded to blob store", is_blob,
               f"keys: {list(payload.keys())}")

        if is_blob:
            blob_hash = payload["$blob"]
            r3 = httpx.get(f"{DAEMON}/v1/blobs/{blob_hash}", timeout=5)
            record("GET /v1/blobs/:hash returns blob content", r3.status_code == 200,
                   f"blob size: {len(r3.content)} bytes")

            # Verify the blob content matches what we sent
            restored = r3.json()
            record("Blob content matches original",
                   len(restored.get("full_conversation_history", [])) == 60)
        else:
            record("GET /v1/blobs/:hash returns blob content", False, "not a blob ref")
            record("Blob content matches original", False, "not a blob ref")
    else:
        record("Payload was offloaded to blob store", False, "no events returned")


# ── 5) Idempotency / Deduplication ──────────────────────────────────────
def test_idempotency() -> None:
    print("\n=== TEST 5: Idempotency / Deduplication ===")
    fixed_event_id = str(uuid4())
    dedup_trace = str(uuid4())

    event = {
        "event_id": fixed_event_id,
        "trace_id": dedup_trace,
        "span_id": str(uuid4()),
        "event_type": "agent_start",
        "node_name": "DedupTestAgent",
        "payload": {"test": "dedup"},
    }

    # Send the exact same event twice
    r1 = httpx.post(f"{DAEMON}/v1/events", json=event, timeout=5)
    record("First insert accepted", r1.status_code == 202)

    time.sleep(0.3)

    r2 = httpx.post(f"{DAEMON}/v1/events", json=event, timeout=5)
    record("Duplicate insert accepted (no crash)", r2.status_code == 202)

    time.sleep(0.3)

    # Verify only ONE event exists for this trace
    r3 = httpx.get(f"{DAEMON}/v1/traces/{dedup_trace}/events", timeout=5)
    events = r3.json().get("events", [])
    record("Only 1 event persisted (dedup worked)", len(events) == 1,
           f"got {len(events)} events")


# ── 6) Schema validation — malformed events ─────────────────────────────
def test_bad_payload() -> None:
    print("\n=== TEST 6: Schema Validation (bad payloads) ===")

    # Missing required field trace_id
    r1 = httpx.post(f"{DAEMON}/v1/events", json={
        "span_id": "x", "event_type": "test",
    }, timeout=5)
    record("Missing trace_id rejected", r1.status_code == 400)

    # Completely empty body
    r2 = httpx.post(f"{DAEMON}/v1/events", content=b"", timeout=5,
                    headers={"content-type": "application/json"})
    record("Empty body rejected", r2.status_code == 400)

    # Invalid JSON
    r3 = httpx.post(f"{DAEMON}/v1/events", content=b"{broken json",
                    timeout=5, headers={"content-type": "application/json"})
    record("Invalid JSON rejected", r3.status_code == 400)


# ── 7) State injection endpoint test ────────────────────────────────────
def test_state_injection() -> None:
    print("\n=== TEST 7: State Injection Round-Trip ===")
    inject_trace = str(uuid4())
    inject_span = str(uuid4())

    # First, create an agent_start so the span exists
    httpx.post(f"{DAEMON}/v1/events", json={
        "trace_id": inject_trace,
        "span_id": inject_span,
        "event_type": "agent_start",
        "node_name": "PausedAgent",
        "payload": {"original_state": {"temperature": 0.7}},
    }, timeout=5)
    time.sleep(0.3)

    # Now inject a modified state
    inject_event = {
        "trace_id": inject_trace,
        "span_id": inject_span,
        "event_type": "state_injection",
        "node_name": "PausedAgent",
        "payload": {"temperature": 0.2, "injected_by": "dashboard_user"},
    }
    r = httpx.post(f"{DAEMON}/v1/events", json=inject_event, timeout=5)
    record("state_injection event accepted", r.status_code == 202)

    time.sleep(0.3)

    # Verify the injection event appears in the trace
    r2 = httpx.get(f"{DAEMON}/v1/traces/{inject_trace}/events", timeout=5)
    events = r2.json().get("events", [])
    injection_events = [e for e in events if e["event_type"] == "state_injection"]
    record("state_injection event persisted", len(injection_events) == 1)

    if injection_events:
        injected_payload = injection_events[0].get("payload", {})
        record("Injected payload correct",
               injected_payload.get("temperature") == 0.2,
               f"payload: {json.dumps(injected_payload)}")


# ── 8) Polling endpoint ─────────────────────────────────────────────────
def test_polling() -> None:
    print("\n=== TEST 8: Polling Endpoint ===")
    r = httpx.get(f"{DAEMON}/v1/events?since=0", timeout=5)
    data = r.json()
    events = data.get("events", [])
    record("GET /v1/events?since=0 returns events", len(events) > 0,
           f"{len(events)} events")


# ── 9) 404 handling ─────────────────────────────────────────────────────
def test_404() -> None:
    print("\n=== TEST 9: 404 Handling ===")
    r = httpx.get(f"{DAEMON}/v1/nonexistent", timeout=5)
    record("Unknown route returns 404", r.status_code == 404)

    r2 = httpx.get(f"{DAEMON}/v1/blobs/deadbeef123", timeout=5)
    record("Missing blob returns 404", r2.status_code == 404)


# ── MAIN ────────────────────────────────────────────────────────────────
def main() -> None:
    print("=" * 60)
    print("  AgentGlass — Comprehensive End-to-End Test Suite")
    print("=" * 60)

    # 0) Health
    if not test_health():
        print("\n\033[91mDAEMON NOT RUNNING. Start it first: pnpm --filter @agentglass/daemon dev\033[0m")
        sys.exit(1)

    # 1) Pipeline
    client = AgentGlassClient(daemon_url=DAEMON, flush_interval_ms=80, max_batch_size=5)
    trace_id = test_pipeline(client)

    # Wait for flush
    time.sleep(1.5)

    # 2-3) REST
    test_rest_traces(trace_id)
    test_rest_events(trace_id)

    # 4) Blob
    test_blob_offload()

    # 5) Idempotency
    test_idempotency()

    # 6) Schema validation
    test_bad_payload()

    # 7) State injection
    test_state_injection()

    # 8) Polling
    test_polling()

    # 9) 404
    test_404()

    # ── Summary ──
    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = total - passed

    print("\n" + "=" * 60)
    print(f"  RESULTS: {passed}/{total} passed", end="")
    if failed:
        print(f"  |  {failed} FAILED")
        print("=" * 60)
        print("\n  Failed tests:")
        for name, ok, detail in results:
            if not ok:
                print(f"    - {name}: {detail}")
    else:
        print(f"  |  ALL PASSED!")
        print("=" * 60)

    print(f"\n  Main trace ID: {trace_id}")
    print(f"  Dashboard: http://localhost:3000")
    print(f"  (Open the dashboard and select the trace to see the full graph)")
    print()

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
