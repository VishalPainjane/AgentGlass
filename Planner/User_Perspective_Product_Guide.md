# User Perspective Product Guide (Detailed)

Status: Draft
Objective: Explain what a user brings, why they use AgentGlass, and how they use each feature end to end.

---

## 1) Who the user is

Typical users include:
- Solo builders or small teams building multi-agent Python systems.
- Research and ML engineers debugging agent logic or RAG pipelines.
- Product teams validating that prompt changes do not break downstream tools.
- Devs who need local-first observability without sending data to third parties.

---

## 2) What the user brings (inputs and prerequisites)

The user brings their own code and runs it locally. AgentGlass does not take their code or run it remotely.

What the user provides:
- Their Python agent system (scripts, notebooks, or services) that they already own and execute.
- Their prompts, tools, and agent state logic as-is.
- API keys for the model providers they already use (OpenAI, Anthropic, etc.).
- Local machine resources (CPU/RAM/disk) to run the daemon and dashboard.

How it integrates with their code:
- The user adds small instrumentation calls in their code (AgentGlass SDK) or attaches a span processor (OpenTelemetry).
- AgentGlass reads events emitted by those calls and stores them locally.
- Their code remains in their repository; no code is uploaded or shared.

What the user does NOT have to do:
- They do not need to send code to AgentGlass or a cloud service.
- They do not need to rewrite their agent logic or change their model provider.
- They do not need to expose their data outside their machine.

How the tools work at a high level:
- SDK: Sends structured events (trace, span, node output) to the local daemon over HTTP/WebSocket.
- Daemon: Persists events in SQLite and streams updates to the dashboard in real time.
- Dashboard: Renders the graph, timeline, and inspectors from local data.

Optional but common:
- LangGraph app for orchestration.
- RAG retrieval system and vector store.
- CI workflow for regression checks.

---

## 3) Why the user uses AgentGlass

Pain points AgentGlass solves:
- Multi-agent systems fail silently and are hard to debug.
- Logs do not show the actual decision path or state changes over time.
- Cloud observability tools are expensive and force data off machine.

AgentGlass gives:
- Deterministic time travel debugging.
- Node-level and event-level visibility into agent execution.
- Local-first storage so data stays on the machine.

---

## 4) Where the user uses it

- Locally on a dev laptop or workstation.
- On a secure, offline environment with local storage.
- In a team environment where the daemon and dashboard are run on a shared dev machine.

---

## 5) When the user uses it

- While building new agent workflows.
- When a run fails and the cause is unclear.
- During prompt or tool changes that can cause regressions.
- Before shipping a new release to compare traces and validate changes.

---

## 6) How much (time, cost, resources)

Time:
- Quickstart setup can be done in minutes.
- Most debugging sessions are minutes to hours depending on complexity.

Cost:
- AgentGlass runs locally and does not add per-trace costs.
- Model usage cost depends on the provider you already use.
- VCR cache can reduce repeated model costs during debugging.

Resources:
- Disk usage grows with trace history and blobs.
- CPU and RAM depend on event volume and graph size.

---

## 7) How the user uses the product (end to end)

### Step A: Start the local stack

Option 1 (CLI via npm):
1. Run `npx @agentglass/cli up`.
2. This starts the daemon on http://127.0.0.1:8765 and the dashboard on http://localhost:3456.

Option 2 (monorepo dev mode):
1. Run `pnpm install`.
2. Run `pnpm build`.
3. Run `pnpm dev:up`.

### Step B: Instrument the agent (Python)

Option 1 (Native SDK):
1. Install the SDK: `pip install agentglass-python`.
2. Create a client: `AgentGlassClient()`.
3. Start a trace and create spans around agent steps.

Option 2 (OpenTelemetry):
1. Add AgentGlass span processor.
2. Keep existing OTel spans and send them to AgentGlass.

Option 3 (LangGraph):
1. Wrap the compiled app using `instrument_langgraph`.
2. Run the app to emit events into the daemon.

### Step C: Run the agent and open the dashboard

1. Execute the agent code.
2. Open http://localhost:3456.
3. The graph should populate as events arrive.

### Step D: Debug the run

1. Use the trace selector to pick the run you want.
2. Inspect the node graph and event timeline.
3. Click nodes to see inputs, outputs, timing, and errors.
4. Use the timeline scrubber to move through time and view state at a specific point.
5. Export or share trace data if needed.

---

## 8) Feature context and usage (why and how)

### Live Trace Graph

Why:
- See the agent execution path and its branching logic.

How:
1. Open the live view.
2. Verify nodes appear as agent steps run.
3. Click nodes to inspect payloads.

### Node Inspector

Why:
- Inspect the exact input, output, and error for a step.

How:
1. Click a node in the graph.
2. Review the inputs, outputs, and metadata.
3. If there is an error, copy the stack trace for debugging.

### Event Timeline and Time Scrubber

Why:
- Replay agent execution to see the precise moment of failure.

How:
1. Move the scrubber to a time index.
2. Watch the graph update to the state at that moment.
3. Compare node data across different time points.

### Compare Traces (Execution Branching)

Why:
- Compare two runs to confirm a change fixed or broke the system.

How:
1. Select a primary trace.
2. Select a compare trace.
3. Review summary metrics (duration, nodes, errors).
4. Inspect node-level diffs and output changes.

### VCR Cache Manager

Why:
- Reduce LLM costs while debugging and replaying runs.

How:
1. Wrap LLM calls with the VCR decorator in the SDK.
2. Run the agent once to populate cache.
3. Use the cache manager to inspect or clear entries.

### God Mode (State Injection)

Why:
- Pause a run and inject a corrected state to continue execution.

How:
1. Add a wait block in Python using `wait_for_injection`.
2. Run the agent and wait for the pause.
3. In the dashboard, edit JSON state in the inspector.
4. Click Inject State to resume the agent.

### RAG X-Ray

Why:
- Confirm retrieved chunks and scores are correct and relevant.

How:
1. Select a retrieval node.
2. Review retrieved chunks and vector distances.
3. Validate metadata and ranking.

### Export and Reporting

Why:
- Save trace data for regression tests, bugs, or shared analysis.

How:
1. Export the trace output (if enabled).
2. Attach it to a bug report or test case.

### Settings

Why:
- Control daemon connection, storage, and UI preferences.

How:
1. Open the Settings page.
2. Configure host/port and reconnect.
3. Set data retention and cache options.
4. Set theme and UI preferences.

---

## 9) Common workflows (step by step)

### Debug a failing agent run

1. Start the daemon and dashboard.
2. Run the agent.
3. Select the trace in the top bar.
4. Locate the error node (red or error status).
5. Inspect inputs and outputs for corrupted context.
6. Use the scrubber to see what preceded the failure.
7. Fix the prompt or tool logic and rerun.
8. Compare the new run to the old run.

### Validate a prompt change

1. Run the original prompt and capture the trace.
2. Update the prompt and run again.
3. Compare traces to detect differences.
4. Ensure downstream tools behave as expected.

### Reduce LLM costs during debugging

1. Wrap LLM calls with the VCR decorator.
2. Run once to cache responses.
3. Repeat runs locally without paying for API calls.
4. Clear cache if the prompt or model changes.

### Inspect a RAG pipeline

1. Trigger a run that uses retrieval.
2. Open the RAG X-Ray panel.
3. Confirm chunk relevance and metadata.
4. Adjust retrieval parameters and rerun.

---

## 10) Success signals

- The dashboard shows your trace within seconds of running the agent.
- Graph nodes and event timeline are in sync with the run.
- You can reproduce errors and fix them with confidence.
- Compare view shows real diffs between runs.
- Cache manager and settings contain real data or clear empty states.

---

## 11) Troubleshooting (fast checks)

- No traces appear: confirm the daemon is running and the SDK is configured.
- Connection issues: verify host and port, then reconnect.
- Compare view empty: ensure both traces are selected.
- Cache view empty: confirm VCR is enabled and cache is populated.
- Docs missing: check the docs page and repository docs for updates.
