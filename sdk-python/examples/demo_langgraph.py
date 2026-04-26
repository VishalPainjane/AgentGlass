"""
AgentGlass Demo — Simulated Multi-Agent Run

This script simulates a 3-node multi-agent pipeline (Researcher →
Analyzer → Writer) and emits all telemetry events to the local
AgentGlass daemon, so you can see the dashboard come alive.

Prerequisites:
    1. Start the daemon:   pnpm dev:daemon
    2. Start the dashboard: pnpm dev:dashboard
    3. Open http://localhost:3000
    4. Run this script:    python sdk-python/examples/demo_langgraph.py

You do NOT need LangGraph installed — this demo simulates the events
directly to showcase the dashboard.
"""

from __future__ import annotations

import time
from uuid import uuid4

from agentglass_python import AgentGlassClient, AgentGlassEvent


def main() -> None:
    client = AgentGlassClient(
        daemon_url="http://127.0.0.1:7777",
        flush_interval_ms=100,
        max_batch_size=10,
    )

    trace_id = str(uuid4())
    orchestrator = str(uuid4())
    researcher = str(uuid4())
    analyzer = str(uuid4())
    writer = str(uuid4())
    search_tool = str(uuid4())
    calc_tool = str(uuid4())

    print(f"🔍 AgentGlass Demo — Trace ID: {trace_id[:8]}…")
    print("   Sending events to daemon at http://127.0.0.1:7777")
    print()

    def emit(event_type: str, span_id: str, node_name: str,
             parent: str | None = None, payload: dict | None = None) -> None:
        client.track(
            AgentGlassEvent(
                trace_id=trace_id,
                span_id=span_id,
                parent_span_id=parent,
                event_type=event_type,
                node_name=node_name,
                payload=payload or {},
            )
        )
        print(f"   📡 {event_type:16s} → {node_name}")
        time.sleep(0.3)  # Simulate work + make dashboard updates visible

    # ---- Orchestrator starts ----
    print("▶ Orchestrator starting…")
    emit("agent_start", orchestrator, "Orchestrator", payload={
        "name": "Orchestrator",
        "input": {"query": "Analyze the impact of multi-agent architectures on error rates"}
    })

    # ---- Researcher agent ----
    print("\n▶ Researcher agent starting…")
    emit("agent_start", researcher, "Researcher", parent=orchestrator, payload={
        "name": "Researcher",
        "task": "Find relevant papers and data"
    })

    # Tool: web_search
    emit("tool_call", search_tool, "web_search", parent=researcher, payload={
        "tool_name": "web_search",
        "query": "multi-agent error amplification 2026 research"
    })
    time.sleep(0.5)
    emit("tool_result", search_tool, "web_search", parent=researcher, payload={
        "tool_name": "web_search",
        "results": [
            {"title": "The Multi-Agent Trap", "year": 2026, "finding": "17.2x error amplification"},
            {"title": "AgentStepper: Interactive Debugging", "year": 2026, "finding": "Step-wise intervention needed"},
            {"title": "AgentDebug: Error Taxonomy", "year": 2026, "finding": "Cascading failure patterns"},
        ]
    })

    # LLM call within researcher
    emit("llm_request", researcher, "Researcher", parent=orchestrator, payload={
        "model": "gemini-2.0-flash",
        "prompt": "Summarize the following research papers on multi-agent error patterns…"
    })
    time.sleep(0.4)
    emit("llm_response", researcher, "Researcher", parent=orchestrator, payload={
        "model": "gemini-2.0-flash",
        "response": "Research shows that unstructured multi-agent networks amplify errors by up to 17.2x. The primary failure mode (36.9%) is coordination breakdowns.",
        "tokens": {"input": 847, "output": 312}
    })

    emit("agent_end", researcher, "Researcher", parent=orchestrator, payload={
        "name": "Researcher",
        "summary": "3 papers found, key finding: 17.2x error amplification"
    })
    print("   ✅ Researcher complete")

    # ---- Analyzer agent ----
    print("\n▶ Analyzer agent starting…")
    emit("agent_start", analyzer, "Analyzer", parent=orchestrator, payload={
        "name": "Analyzer",
        "task": "Statistical analysis of error patterns"
    })

    # Tool: calculator
    emit("tool_call", calc_tool, "statistics_tool", parent=analyzer, payload={
        "tool_name": "statistics_tool",
        "operation": "correlation_analysis",
        "data_points": 150
    })
    time.sleep(0.3)
    emit("tool_result", calc_tool, "statistics_tool", parent=analyzer, payload={
        "tool_name": "statistics_tool",
        "result": {"correlation": 0.87, "p_value": 0.001, "confidence": "99%"}
    })

    # State snapshot
    emit("state_snapshot", analyzer, "Analyzer", parent=orchestrator, payload={
        "state": {
            "papers_analyzed": 3,
            "error_amplification_factor": 17.2,
            "primary_failure_mode": "coordination_breakdown",
            "confidence": 0.99,
        },
        "stage": "analysis_complete"
    })

    emit("agent_end", analyzer, "Analyzer", parent=orchestrator, payload={
        "name": "Analyzer",
        "conclusion": "Strong correlation between agent count and error rate"
    })
    print("   ✅ Analyzer complete")

    # ---- Writer agent ----
    print("\n▶ Writer agent starting…")
    emit("agent_start", writer, "Writer", parent=orchestrator, payload={
        "name": "Writer",
        "task": "Produce final report"
    })

    emit("llm_request", writer, "Writer", parent=orchestrator, payload={
        "model": "gemini-2.5-pro",
        "prompt": "Write a comprehensive analysis report on multi-agent error amplification…",
        "context_tokens": 4200
    })
    time.sleep(0.6)
    emit("llm_response", writer, "Writer", parent=orchestrator, payload={
        "model": "gemini-2.5-pro",
        "response": "# Multi-Agent Error Amplification Report\n\nOur analysis of 3 peer-reviewed papers reveals a critical finding: unstructured multi-agent networks amplify errors by up to 17.2x compared to single-agent baselines…",
        "tokens": {"input": 4200, "output": 1850}
    })

    emit("agent_end", writer, "Writer", parent=orchestrator, payload={
        "name": "Writer",
        "output": "Report generated successfully (1850 tokens)"
    })
    print("   ✅ Writer complete")

    # ---- Orchestrator ends ----
    print("\n▶ Orchestrator finishing…")
    emit("agent_end", orchestrator, "Orchestrator", payload={
        "name": "Orchestrator",
        "result": "Pipeline complete",
        "total_agents": 3,
        "total_tool_calls": 2,
        "total_llm_calls": 2,
    })

    # Flush remaining events
    time.sleep(0.5)
    client.close()

    print("\n" + "=" * 50)
    print("✨ Demo complete!")
    print(f"   Trace ID: {trace_id}")
    print(f"   Events sent: ~20")
    print(f"   Open http://localhost:3000 to see the graph")
    print("=" * 50)


if __name__ == "__main__":
    main()
