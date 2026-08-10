"""
Incident Debug Demo — regression in agent execution, trace back, fix
===================================================================

THE STORY (no AgentGlass)
-------------------------
A refund automation pipeline runs as a LangGraph:

  Intake -> EvidenceGatherer -> PolicyGate -> RefundExecutor
                                    |
                                    +-> EscalationQueue (on reject)

Deploy v2.3 accidentally raised PolicyGate min retrieval score: 0.35 -> 0.55.
Evidence for a valid EU ticket scores 0.42 — above the OLD bar, below the NEW bar.
Execution dies at PolicyGate. RefundExecutor never runs.

That is a pure agent/architecture bug: wrong threshold in one node breaks the path.

THE DEBUG LOOP (with AgentGlass)
--------------------------------
1. REPRO   — run with broken threshold, get a BLOCKED trace
2. TRACE   — /live: graph + timeline + scrubber find PolicyGate rejection
3. INSPECT — PolicyGate input shows threshold vs score; EvidenceGatherer + RAG X-Ray
4. FIX     — inject corrected threshold while paused, OR re-run with --fixed
5. COMPARE — /compare repro trace vs fixed trace

Modes
-----
  debug  (default)  Pause at PolicyGate when blocked; inject fix live
  repro             Full broken run (no pause) — for post-mortem / compare
  fixed             Correct threshold — success baseline

Examples
--------
  # Interactive incident (pauses for dashboard fix)
  python examples/demo_incident_debug_agent.py

  # Generate two traces for Compare page
  python examples/demo_incident_debug_agent.py --mode repro
  python examples/demo_incident_debug_agent.py --mode fixed

While paused (debug mode):
  God Mode: inject threshold = 0.35
"""

from __future__ import annotations

import argparse
import re
import time
from collections import Counter
from typing import Annotated, Any, Literal, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from agentglass_python import AgentGlassClient
from agentglass_python.langgraph_adapter import instrument_langgraph
from agentglass_python.rag import log_retrieval

# Threshold regression introduced in fictional deploy v2.3
THRESHOLD_BEFORE_DEPLOY = 0.35
THRESHOLD_AFTER_REGRESSION = 0.55

QUERY = "EU customer refund failing after GDPR retention purge - txn_8f2a"

POLICY_CORPUS: list[dict[str, Any]] = [
    {
        "text": (
            "EU GDPR Article 17 requires customer PII deletion after 90 days. "
            "Refund matching needs active billing records; expired retention blocks refunds."
        ),
        "source": "compliance/eu-gdpr-retention-policy.pdf",
        "metadata": {"section": "Data Retention"},
    },
    {
        "text": (
            "Stripe refunds.refund.updated may return charge_already_refunded when "
            "duplicate attempts occur in the same billing cycle."
        ),
        "source": "runbooks/stripe-refund-errors.md",
        "metadata": {"team": "payments"},
    },
    {
        "text": "General FAQ: refunds within 30 days for US customers only.",
        "source": "faq/us-refunds.html",
        "metadata": {"region": "US"},
    },
]


class RefundPipelineState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    ticket_id: str
    query: str
    mode: str
    policy_threshold: float
    policy_chunks: list[dict[str, Any]]
    top_retrieval_score: float
    gate_verdict: str | None
    gate_reason: str | None
    outcome: str | None


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def vector_search(query: str, corpus: list[dict[str, Any]], top_k: int = 3) -> list[dict[str, Any]]:
    query_tokens = Counter(_tokenize(query))
    if not query_tokens:
        return []

    doc_freq: Counter[str] = Counter()
    tokenized_docs: list[list[str]] = []
    for doc in corpus:
        tokens = _tokenize(doc["text"])
        tokenized_docs.append(tokens)
        for token in set(tokens):
            doc_freq[token] += 1

    n_docs = len(corpus)
    scored: list[tuple[float, dict[str, Any]]] = []
    for doc, tokens in zip(corpus, tokenized_docs):
        if not tokens:
            continue
        tf = Counter(tokens)
        score = 0.0
        for term, q_freq in query_tokens.items():
            if term in tf:
                idf = 1.0 + (n_docs / (1 + doc_freq[term]))
                score += (tf[term] / len(tokens)) * idf * q_freq
        scored.append((score, {**doc, "score": round(score, 4)}))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item[1] for item in scored[:top_k]]


def parse_injected_float(injection: dict[str, Any], field: str) -> float | None:
    if field in injection:
        try:
            return float(injection[field])
        except (TypeError, ValueError):
            return None
    if injection.get("field") == field and "value" in injection:
        try:
            return float(injection["value"])
        except (TypeError, ValueError):
            return None
    return None


def print_debug_playbook(trace_id: str, threshold: float, top_score: float) -> None:
    print()
    print("=" * 62)
    print("  INCIDENT DEBUG PLAYBOOK  (agent PAUSED at PolicyGate)")
    print("=" * 62)
    print(f"  Trace ID: {trace_id}")
    print(f"  Symptom:  refund BLOCKED at PolicyGate")
    print(f"  Evidence: top_retrieval_score={top_score:.3f}  threshold={threshold:.2f}")
    print()
    print("  TRACE BACK (dashboard http://localhost:3456/live):")
    print("    1. Select this trace in Active Flow")
    print("    2. Graph: follow Intake -> EvidenceGatherer -> PolicyGate (stuck)")
    print("    3. Timeline scrubber: rewind to EvidenceGatherer")
    print("    4. Click EvidenceGatherer -> RAG X-Ray: chunks ARE relevant")
    print("    5. Click PolicyGate -> Input: score below threshold")
    print()
    print("  ROOT CAUSE:")
    print("    Deploy v2.3: (1) ranker dampens scores ~39%")
    print("                 (2) threshold raised 0.35 -> 0.55")
    print(f"    Effective evidence ({top_score:.3f}) fails new gate.")
    print()
    print("  FIX (pick one):")
    print("    A) LIVE:  God Mode -> inject threshold = 0.35")
    print("    B) CONFIG: re-run with --mode fixed")
    print("    C) COMPARE: repro trace vs fixed trace on /compare")
    print("=" * 62)
    print()


def build_graph(
    client: AgentGlassClient,
    *,
    trace_id: str,
    mode: Literal["debug", "repro", "fixed"],
    policy_threshold: float,
) -> Any:
    pause_on_block = mode == "debug"

    def intake(state: RefundPipelineState) -> dict[str, Any]:
        print("[1/4] Intake - loading ticket context...")
        return {
            "messages": [
                HumanMessage(
                    content=f"Ticket {state['ticket_id']}: {state['query']} (mode={state['mode']})"
                )
            ],
        }

    def evidence_gatherer(state: RefundPipelineState) -> dict[str, Any]:
        print("[2/4] EvidenceGatherer - vector search over policy corpus...")
        chunks = vector_search(state["query"], POLICY_CORPUS, top_k=3)

        # v2.3 also shipped a ranker regression that dampens scores (~61% of pre-deploy values)
        ranker_scale = 1.0 if state["mode"] == "fixed" else 0.61
        for chunk in chunks:
            chunk["score"] = round(float(chunk["score"]) * ranker_scale, 4)

        log_retrieval(
            client,
            query=state["query"],
            results=chunks,
            node_name="EvidenceGatherer",
        )
        top_score = chunks[0]["score"] if chunks else 0.0
        return {
            "policy_chunks": chunks,
            "top_retrieval_score": top_score,
            "messages": [
                AIMessage(
                    content=f"Retrieved {len(chunks)} chunks; top_score={top_score:.3f}"
                )
            ],
        }

    def policy_gate(state: RefundPipelineState) -> dict[str, Any]:
        threshold = state["policy_threshold"]
        top_score = state["top_retrieval_score"]
        print(f"[3/4] PolicyGate - checking {top_score:.3f} >= {threshold:.2f} ...")

        if top_score >= threshold:
            print("   -> PASS: evidence strong enough")
            return {
                "gate_verdict": "approved",
                "gate_reason": f"top_score {top_score:.3f} >= threshold {threshold:.2f}",
                "messages": [AIMessage(content="PolicyGate: APPROVED")],
            }

        print("   -> FAIL: evidence below threshold (refund path blocked)")

        if pause_on_block:
            print_debug_playbook(
                trace_id=trace_id,
                threshold=threshold,
                top_score=top_score,
            )
            injection = client.breakpoint("PolicyGate")
            if injection:
                new_threshold = parse_injected_float(injection, "threshold")
                if new_threshold is not None and top_score >= new_threshold:
                    print(f"   -> INJECT FIX: threshold {threshold:.2f} -> {new_threshold:.2f}")
                    return {
                        "policy_threshold": new_threshold,
                        "gate_verdict": "approved",
                        "gate_reason": (
                            f"approved after inject: top_score {top_score:.3f} "
                            f">= injected threshold {new_threshold:.2f}"
                        ),
                        "messages": [
                            AIMessage(content="PolicyGate: APPROVED (threshold corrected via God Mode)")
                        ],
                    }
                print("   -> inject received but still below threshold")

        client.track_event(
            event_type="error",
            node_name="PolicyGate",
            payload={
                "type": "PolicyGateRejected",
                "message": "Evidence below minimum retrieval score",
                "top_retrieval_score": top_score,
                "policy_threshold": threshold,
                "regression": "deploy_v2.3: ranker dampening + threshold 0.35 -> 0.55",
            },
        )
        return {
            "gate_verdict": "blocked",
            "gate_reason": f"top_score {top_score:.3f} < threshold {threshold:.2f}",
            "messages": [AIMessage(content="PolicyGate: BLOCKED")],
        }

    def refund_executor(state: RefundPipelineState) -> dict[str, Any]:
        print("[4/4] RefundExecutor - issuing refund...")
        outcome = f"REFUND_APPROVED:{state['ticket_id']}:score={state['top_retrieval_score']:.3f}"
        return {
            "outcome": outcome,
            "messages": [AIMessage(content=outcome)],
        }

    def escalation_queue(state: RefundPipelineState) -> dict[str, Any]:
        print("[4/4] EscalationQueue - manual review required...")
        outcome = f"ESCALATED:{state['ticket_id']}:reason={state.get('gate_reason')}"
        return {
            "outcome": outcome,
            "messages": [AIMessage(content=outcome)],
        }

    def route_after_gate(state: RefundPipelineState) -> Literal["refund_executor", "escalation_queue"]:
        if state.get("gate_verdict") == "approved":
            return "refund_executor"
        return "escalation_queue"

    workflow = StateGraph(RefundPipelineState)
    workflow.add_node("intake", intake)
    workflow.add_node("evidence_gatherer", evidence_gatherer)
    workflow.add_node("policy_gate", policy_gate)
    workflow.add_node("refund_executor", refund_executor)
    workflow.add_node("escalation_queue", escalation_queue)

    workflow.set_entry_point("intake")
    workflow.add_edge("intake", "evidence_gatherer")
    workflow.add_edge("evidence_gatherer", "policy_gate")
    workflow.add_conditional_edges("policy_gate", route_after_gate)
    workflow.add_edge("refund_executor", END)
    workflow.add_edge("escalation_queue", END)

    return workflow.compile()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Incident debug demo: regression -> trace back -> fix",
    )
    parser.add_argument(
        "--mode",
        choices=["debug", "repro", "fixed"],
        default="debug",
        help="debug=pause+inject, repro=broken trace, fixed=corrected trace",
    )
    args = parser.parse_args()

    if args.mode == "fixed":
        threshold = THRESHOLD_BEFORE_DEPLOY
        mode_label = "fixed"
    else:
        threshold = THRESHOLD_AFTER_REGRESSION
        mode_label = "repro" if args.mode == "repro" else "debug"

    client = AgentGlassClient(daemon_url="http://127.0.0.1:8765", flush_interval_ms=80)
    trace_id = client.start_trace()

    print()
    print("=" * 62)
    print("  INCIDENT: EU refund pipeline regression (deploy v2.3)")
    print("=" * 62)
    print(f"  Mode: {args.mode}  |  policy_threshold={threshold:.2f}")
    print(f"  Query: {QUERY}")
    print()

    if args.mode in ("debug", "repro"):
        print("  BACKGROUND:")
        print("    v2.3 ranker regression + threshold 0.35 -> 0.55.")
        print("    Borderline evidence now fails PolicyGate.")
        print()

    graph = build_graph(client, trace_id=trace_id, mode=args.mode, policy_threshold=threshold)
    instrumented = instrument_langgraph(graph, client, trace_id=trace_id, llm_label="policy-rules")

    initial_state: RefundPipelineState = {
        "messages": [],
        "ticket_id": "TKT-EU-4421",
        "query": QUERY,
        "mode": mode_label,
        "policy_threshold": threshold,
        "policy_chunks": [],
        "top_retrieval_score": 0.0,
        "gate_verdict": None,
        "gate_reason": None,
        "outcome": None,
    }

    # Tag trace for compare overlay
    client.track_event(
        event_type="agent_start",
        node_name="IncidentRun",
        payload={"variant": mode_label, "deploy": "v2.3", "policy_threshold": threshold},
        trace_id=trace_id,
    )

    result = instrumented.invoke(initial_state)

    print()
    print("--- Execution result ---")
    print(f"  top_retrieval_score: {result['top_retrieval_score']:.3f}")
    print(f"  policy_threshold:    {result['policy_threshold']:.2f}")
    print(f"  gate_verdict:        {result['gate_verdict']}")
    print(f"  outcome:             {result['outcome']}")

    time.sleep(1.5)
    client.close()

    print()
    print(f"Trace ID: {trace_id}")
    print("Dashboard: http://localhost:3456/live")
    if args.mode == "repro":
        print("Next: python examples/demo_incident_debug_agent.py --mode fixed")
        print("Then: http://localhost:3456/compare")
    print()


if __name__ == "__main__":
    main()
