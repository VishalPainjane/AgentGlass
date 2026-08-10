"""
Refund Triage Agent — teaches LangGraph first, AgentGlass second
================================================================

WITHOUT AgentGlass (mental model)
---------------------------------
This is a normal Python program structured as a **state machine**:

  1. You hold one shared `state` dict (ticket fields, risk score, decision).
  2. LangGraph runs **nodes** one after another. Each node:
       - reads the current state
       - does real work (rules, math, optional LLM)
       - returns a **partial update** (only the keys it changed)
  3. LangGraph **merges** that update into state and follows the next **edge**.
  4. A **conditional edge** picks the path (auto-approve vs escalate) from state.

Nothing is "magic telemetry" — it is just functions mutating a dict through a graph.

WITH AgentGlass (what changes)
------------------------------
Same graph execution. Additionally:

  - `instrument_langgraph()` emits span events (start/end, LLM, tools) to the daemon.
  - `client.breakpoint("HumanReview")` **blocks** that node until the dashboard
    sends an inject command — only while the process is still running.

Run (daemon + dashboard must already be up):
  python examples/demo_refund_triage_agent.py
  python examples/demo_refund_triage_agent.py --no-pause   # skip human gate

While paused, in the dashboard:
  1. Open http://localhost:3456/live
  2. Select the active trace (terminal prints trace id)
  3. Click **HumanReview** on the graph
  4. God Mode (⚡) → `inject decision = approve`
     OR Node Inspector → edit Input JSON → Inject State with {"decision": "approve"}
"""

from __future__ import annotations

import argparse
import time
from typing import Annotated, Any, Literal, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from agentglass_python import AgentGlassClient
from agentglass_python.langgraph_adapter import instrument_langgraph

# ---------------------------------------------------------------------------
# Shared state — the single object every node reads and updates
# ---------------------------------------------------------------------------

class RefundState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    ticket_id: str
    customer_id: str
    amount_usd: float
    region: str
    reason: str
    risk_score: int
    risk_factors: list[str]
    human_decision: str | None
    outcome: str | None


# ---------------------------------------------------------------------------
# Pure business logic (no AgentGlass)
# ---------------------------------------------------------------------------

def score_refund_risk(amount_usd: float, region: str, reason: str) -> tuple[int, list[str]]:
    """Deterministic risk engine — real Python rules, not scripted telemetry."""
    score = 0
    factors: list[str] = []

    if amount_usd >= 500:
        score += 35
        factors.append("high_amount")
    elif amount_usd >= 150:
        score += 20
        factors.append("medium_amount")

    if region.upper() == "EU":
        score += 15
        factors.append("eu_regulatory_scope")

    reason_lower = reason.lower()
    if "chargeback" in reason_lower or "fraud" in reason_lower:
        score += 30
        factors.append("fraud_signal")
    if "duplicate" in reason_lower:
        score += 25
        factors.append("duplicate_refund_risk")

    return min(score, 100), factors


def build_graph(
    client: AgentGlassClient,
    *,
    pause_at_review: bool,
) -> Any:
    """Compile the LangGraph workflow. `client` is only used for the optional breakpoint."""

    def intake(state: RefundState) -> dict[str, Any]:
        print("[1/4] Intake - normalizing ticket...")
        summary = (
            f"Ticket {state['ticket_id']}: ${state['amount_usd']:.2f} "
            f"refund ({state['region']}) — {state['reason']}"
        )
        return {"messages": [HumanMessage(content=summary)]}

    def risk_engine(state: RefundState) -> dict[str, Any]:
        print("[2/4] RiskEngine - scoring refund...")
        score, factors = score_refund_risk(
            state["amount_usd"],
            state["region"],
            state["reason"],
        )
        return {
            "risk_score": score,
            "risk_factors": factors,
            "messages": [AIMessage(content=f"Risk score {score}/100 - factors: {', '.join(factors)}")],
        }

    def human_review(state: RefundState) -> dict[str, Any]:
        print("[3/4] HumanReview - decision gate...")
        score = state["risk_score"]

        # Low risk: auto-approve without waiting (pure agent behavior)
        if score < 40:
            print("   -> risk < 40: auto-approve (no human needed)")
            return {
                "human_decision": "auto_approve",
                "messages": [AIMessage(content="Auto-approved: low risk")],
            }

        # High risk: optionally pause for dashboard injection
        if pause_at_review:
            print("   -> risk >= 40: PAUSED - open dashboard and inject decision")
            print("      God Mode: inject decision = approve")
            print("      God Mode: inject decision = escalate")
            injection = client.breakpoint("HumanReview")
            if injection:
                if "decision" in injection:
                    decision = str(injection["decision"]).strip().lower()
                elif injection.get("field") == "decision" and "value" in injection:
                    decision = str(injection["value"]).strip().lower()
                else:
                    decision = str(injection.get("value") or "escalate").strip().lower()
                if decision in ("approve", "approved", "auto_approve"):
                    decision = "approve"
                elif decision not in ("escalate", "reject", "deny"):
                    decision = "escalate"
                print(f"   -> resumed with injected decision: {decision}")
                return {
                    "human_decision": decision,
                    "messages": [AIMessage(content=f"Human decision (injected): {decision}")],
                }
            print("   -> resumed without injection - defaulting to escalate")
            return {
                "human_decision": "escalate",
                "messages": [AIMessage(content="Human review timed out - escalating")],
            }

        print("   -> risk >= 40: auto-escalate (--no-pause)")
        return {
            "human_decision": "escalate",
            "messages": [AIMessage(content="Escalated: high risk, no human override")],
        }

    def auto_approve(state: RefundState) -> dict[str, Any]:
        print("[4/4] AutoApprove - issuing refund...")
        outcome = f"REFUND_APPROVED:{state['ticket_id']}:${state['amount_usd']:.2f}"
        return {
            "outcome": outcome,
            "messages": [AIMessage(content=outcome)],
        }

    def escalate(state: RefundState) -> dict[str, Any]:
        print("[4/4] EscalationQueue - routing to human ops...")
        outcome = f"ESCALATED:{state['ticket_id']}:risk={state['risk_score']}"
        return {
            "outcome": outcome,
            "messages": [AIMessage(content=outcome)],
        }

    def route_after_review(state: RefundState) -> Literal["auto_approve", "escalate"]:
        decision = (state.get("human_decision") or "escalate").lower()
        if decision in ("auto_approve", "approve", "approved"):
            return "auto_approve"
        return "escalate"

    workflow = StateGraph(RefundState)
    workflow.add_node("intake", intake)
    workflow.add_node("risk_engine", risk_engine)
    workflow.add_node("human_review", human_review)
    workflow.add_node("auto_approve", auto_approve)
    workflow.add_node("escalate", escalate)

    workflow.set_entry_point("intake")
    workflow.add_edge("intake", "risk_engine")
    workflow.add_edge("risk_engine", "human_review")
    workflow.add_conditional_edges("human_review", route_after_review)
    workflow.add_edge("auto_approve", END)
    workflow.add_edge("escalate", END)

    return workflow.compile()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Refund triage LangGraph demo with optional God Mode breakpoint",
    )
    parser.add_argument(
        "--no-pause",
        action="store_true",
        help="Do not block at HumanReview (fast path, no injection demo)",
    )
    parser.add_argument(
        "--amount",
        type=float,
        default=620.0,
        help="Refund amount USD (default 620 → high risk, triggers pause)",
    )
    parser.add_argument(
        "--region",
        default="EU",
        help="Customer region (default EU)",
    )
    parser.add_argument(
        "--reason",
        default="Customer reports duplicate chargeback after GDPR data purge",
        help="Refund reason text",
    )
    args = parser.parse_args()

    pause_at_review = not args.no_pause

    client = AgentGlassClient(daemon_url="http://127.0.0.1:8765", flush_interval_ms=80)
    trace_id = client.start_trace()

    print(f"\n{'=' * 60}")
    print("  Refund Triage Agent  (real LangGraph + optional God Mode)")
    print(f"  pause_at_review={pause_at_review}")
    print(f"{'=' * 60}\n")

    graph = build_graph(client, pause_at_review=pause_at_review)
    instrumented = instrument_langgraph(graph, client, trace_id=trace_id, llm_label="rules-engine")

    initial_state: RefundState = {
        "messages": [],
        "ticket_id": "TKT-8842",
        "customer_id": "cust_eu_119",
        "amount_usd": args.amount,
        "region": args.region,
        "reason": args.reason,
        "risk_score": 0,
        "risk_factors": [],
        "human_decision": None,
        "outcome": None,
    }

    result = instrumented.invoke(initial_state)

    print("\n--- Result ---")
    print(f"Risk score: {result['risk_score']} ({', '.join(result['risk_factors'])})")
    print(f"Human decision: {result['human_decision']}")
    print(f"Outcome: {result['outcome']}")

    time.sleep(1.5)
    client.close()

    print(f"\nTrace ID: {trace_id}")
    print("Dashboard: http://localhost:3456/live")
    if pause_at_review and result["risk_score"] >= 40:
        print("(If you injected during the run, outcome reflects your decision.)\n")
    else:
        print()


if __name__ == "__main__":
    main()
