<div align="center">
  <h1>AgentGlass</h1>
  <p><strong>A local-first observability, debugging, and evaluation workbench for AI agents.</strong></p>
</div>

AgentGlass records real agent execution, lets developers inspect and time-travel through failures, compares runs side-by-side, and evaluates agent behavior — without sending traces to a cloud service.

```text
OBSERVE → DEBUG → UNDERSTAND → EVALUATE → COMPARE
```

## Demo (5–7 minutes)

```powershell
pnpm install
pnpm demo -- --compare
```

Open **http://localhost:3456/live** (graph + timeline) and **http://localhost:3456/compare** (Variant A vs B).

> Use port **3456** only (`pnpm dev:dashboard`). Older `next start` instances on other ports may show stale UI.

### Example agents (`sdk-python/examples`)

| Script | What it teaches |
|--------|-----------------|
| `demo_support_research_agent.py` | Full LangGraph + Ollama; Variant A (SUCCESS) vs B (BLOCKED) for Compare |
| `demo_incident_debug_agent.py` | **Regression story**: broken PolicyGate → trace back in UI → fix via inject or `--mode fixed` |
| `demo_refund_triage_agent.py` | Simpler graph + God Mode pause at HumanReview |
| `demo_god_mode.py` | Minimal breakpoint / inject loop |

```powershell
cd sdk-python
pip install -e ".[langgraph,ollama]"

# Golden compare demo
python examples/demo_support_research_agent.py --variant a
python examples/demo_support_research_agent.py --variant b

# Incident debug (repro → trace → fix)
python examples/demo_incident_debug_agent.py --mode repro
python examples/demo_incident_debug_agent.py              # pauses at PolicyGate for inject
python examples/demo_incident_debug_agent.py --mode fixed
```

**God Mode / Inject** only works while the Python process is **paused** at a `client.breakpoint()` — not on traces that already finished.

## What is AgentGlass?

When a multi-agent system fails, it often fails silently — weak retrieval, a validator rejection, a blocked downstream step. AgentGlass captures the full execution graph locally and makes the failure chain visible in seconds.

```text
Agent runs steps → SDK records events → Daemon stores trace → Dashboard shows graph + timeline
```

On **/live**: React Flow graph is the main view (timeline left, node inspector right). Evaluation details live on **/compare** and via `agentglass eval`.

**Not a Langfuse clone.** AgentGlass is an exploration of what an evaluation and debugging loop for agentic systems can look like, built on a time-travel debugging foundation.

## Architecture

```text
                    Agent Application
                           │
                    AgentGlass SDK
                           │
                           ▼
                ┌─────────────────────┐
                │   Local Daemon      │
                │                     │
                │ ingestion           │
                │ validation          │
                │ trace analysis      │
                │ evaluation          │
                └─────────┬───────────┘
                          │
                    SQLite / blobs
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
          Dashboard                 CLI
              │
      ┌───────┼────────┐
      ▼       ▼        ▼
    Trace   Debug    Evaluate
      │       │        │
      └───────┼────────┘
              ▼
           Compare
```

**Data flow:** Agent → SDK → Daemon (SQLite) → WebSocket → Dashboard. LLM inference stays on **localhost** (Ollama). No trace leaves your machine unless you configure a cloud provider explicitly.

## Feature Matrix

| Capability | Status |
|------------|--------|
| Local tracing | ✅ |
| LangGraph instrumentation | ✅ |
| Live graph | ✅ |
| Timeline debugging | ✅ |
| Node inspection (LLM telemetry) | ✅ |
| God Mode | ✅ (experimental — state injection) |
| Trace comparison | ✅ |
| Trace summaries | ✅ |
| Deterministic evaluation | ✅ |
| Semantic evaluation (Ollama) | ✅ (`--semantic`) |
| Evaluation datasets | Planned |
| Experiments / regression gates | Planned |
| Multi-user / cloud | Planned |
| True execution fork | Planned |

## Evaluation

Deterministic evaluators run without Ollama:

```bash
agentglass eval <trace-id>
```

| Evaluator | Type | What it measures |
|-----------|------|------------------|
| `task_completion:v1` | deterministic | Did execution reach a successful terminal state? |
| `tool_efficiency:v1` | deterministic | Tool/retrieval calls vs **support-research workflow baseline** (not universal) |
| `loop_detection:v1` | deterministic | Repeated execution cycles without progress |
| `answer_groundedness:v1` | LLM (Ollama) | Is the final answer supported by retrieved evidence? |

```bash
agentglass eval <trace-id> --semantic   # adds answer_groundedness via local Ollama
```

## Quick Start

```bash
pnpm install
pnpm dev:up          # daemon + dashboard only
# or
pnpm demo -- --compare   # full golden demo (Variant A + B)
```

- Dashboard: `http://localhost:3456`
- Daemon: `http://127.0.0.1:8765`

### Instrument a Python agent

```bash
cd sdk-python
pip install -e ".[langgraph,ollama]"
python examples/demo_support_research_agent.py --variant a
```

```python
from agentglass_python import AgentGlassClient
from agentglass_python.langgraph_adapter import instrument_langgraph

client = AgentGlassClient()
trace_id = client.start_trace()
instrumented = instrument_langgraph(app, client, trace_id=trace_id)
result = instrumented.invoke(initial_state)
client.close()
```

## Monorepo Structure

- `apps/dashboard` — Next.js debugger UI
- `apps/daemon` — HTTP/WebSocket ingest + SQLite + evaluation
- `packages/sdk-ts` — schemas, trace analyzer, evaluators
- `packages/cli` — `agentglass up`, `demo`, `eval`
- `sdk-python` — Python instrumentation SDK

## Limitations

- Evaluation is per-trace today — no datasets or experiment batches yet
- `tool_efficiency:v1` baseline is scoped to the support-research demo workflow
- Semantic evaluation requires local Ollama; gracefully unavailable if Ollama is down
- God Mode is experimental
- Compare is diff-only (not runtime fork/replay)

## Roadmap

Turn failed traces into reusable evaluation datasets, run experiments against new agent versions, and add CI regression gates.

---

<p align="center">
  <img src="./Planner/Interface_agentglass.png" alt="AgentGlass Interface" width="900"/>
</p>
