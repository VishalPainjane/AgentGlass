<div align="center">
  <h1>AgentGlass</h1>
  <p><strong>The Local-First Observability & Time-Travel Debugger for Autonomous AI Agents.</strong></p>
</div>

<p align="center">
  <img src="./.github/assets/screenshot.png" alt="AgentGlass Dashboard" width="800"/>
</p>

## Why AgentGlass?
When a multi-agent system fails, it doesn't fail loudly with a stack trace. It fails silently through cascading logical errors—an agent makes a poor decision, feeds corrupted context to a specialized sub-agent, and triggers a massive loop of API calls. 

Existing solutions (LangSmith, Datadog) are cloud-heavy, introduce latency, charge per trace, and force you to send sensitive enterprise context to third-party servers.

**AgentGlass democratizes agent observability.** It brings IDE-level, deterministic step-through debugging locally. Isolate root causes, scrub through exact token paths, and manipulate agent states in real-time, all while keeping your data 100% local on your machine.

---

## [Features]

- [-] **Local-First Architecture:** A lightning-fast Node.js daemon and SQLite persistence engine that runs completely on your machine. 
- [-] **Deterministic Time-Travel:** Use the timeline scrubber to perfectly rewind your multi-agent execution graph to the exact microsecond an error occurred.
- [-] **GitFork (Execution Branching):** Compare alternative execution paths side-by-side. Did tweaking a prompt break downstream tools? Visually diff terminal payloads directly in the dashboard without writing mock tests.
- [-] **VCR LLM Cache:** Save real API dollars during iterative debugging. Wrap LLM calls with `@agentglass_vcr` to deterministically cache API responses locally and replay them in `0.00s`.
- [-] **Interactive State Injection:** Set visual breakpoints, edit payloads directly in the browser's Monaco Editor, and inject new state directly into a paused python execution.
- [-] **Light & Dark Mode:** Sleek glassmorphic UI equipped with a first-class Light/Dark mode toggle to fit your working environment.
- [-] **First-Class Framework Support:** Deep auto-instrumentation for LangGraph.
- [-] **OpenTelemetry Native:** Drop-in `AgentGlassSpanProcessor` seamlessly converts standard OTel spans into AgentGlass events. No need to rewrite your instrumentation.
- [-] **Blob Payload Offloading:** Massive LLM context payloads are intelligently offloaded to a local `.agentglass/blobs` directory, ensuring your UI and DB stay ultra-fast.
- [-] **Idempotent Telemetry:** Built-in deduplication handles flaky network flushes and prevents duplicate telemetry events.

---

## [Quick Start]

### 1. Start the AgentGlass Local Stack
You can run the Daemon and Dashboard via the CLI or NPX.

```bash
npx @agentglass/cli up
```

Or, using this monorepo locally:
```bash
pnpm install
pnpm build
pnpm dev:up
```

*This starts the Daemon on `http://127.0.0.1:7777` and the Dashboard on `http://localhost:3000`.*

### 2. Instrument Your Python Agents

Install the Python SDK:
```bash
pip install agentglass-python
```

**Using Native SDK (Zero-config Context Propagation):**
```python
from agentglass_python import AgentGlassClient

client = AgentGlassClient()
trace_id = client.start_trace()

# Create nested Spans effortlessly
with client.create_span("agent_start", "ResearcherAgent", {"query": "Quantum gravity"}):
    # Do LLM work...
    client.track(event_type="tool_call", node_name="WikipediaSearch", payload={"term": "Quantum"})
```

**Using OpenTelemetry:**
```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from agentglass_python.otel import AgentGlassSpanProcessor
from agentglass_python import AgentGlassClient

provider = TracerProvider()
provider.add_span_processor(AgentGlassSpanProcessor(AgentGlassClient()))
trace.set_tracer_provider(provider)
```

**Using LangGraph:**
```python
from agentglass_python.langgraph_adapter import instrument_langgraph

# Takes your existing compiled LangGraph and wraps it
instrumented_app = instrument_langgraph(app, client)

async for event in instrumented_app.astream({"messages": [...]}, stream_mode="values"):
    print(event)
```

### 3. Open the Dashboard!
Navigate to `http://localhost:3000` in your browser. As your Python agents execute, the graph will populate in real-time.

---

## [Deploy Dashboard on Vercel]

You can deploy `apps/dashboard` as a public showcase URL.

### 1. Import the repo in Vercel
- Framework preset: `Next.js`
- Root Directory: `apps/dashboard`
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm build`
- Output Directory: `.next`

### 2. Optional env vars

If you have a reachable daemon/API server, set:
- `NEXT_PUBLIC_DAEMON_HTTP_URL=https://your-daemon-host`
- `NEXT_PUBLIC_DAEMON_WS_URL=wss://your-daemon-host/ws` (optional; inferred from HTTP URL if omitted)

If no daemon is configured, the dashboard now auto-loads a built-in demo trace on hosted domains so your Vercel URL still has interactive content to showcase.

You can disable that behavior with:
- `NEXT_PUBLIC_DEMO_FALLBACK=false`

### 3. Redeploy
After setting env vars, trigger a redeploy from Vercel. The dashboard will either:
- connect to your live daemon, or
- fall back to demo data when running as a hosted showcase.

---

## [Monorepo Structure]

- `apps/dashboard` - The React 19 / Next.js glassmorphism control center. Uses Zustand for deterministic timeline slicing.
- `apps/daemon` - Express/WebSocket ingest server backed by `better-sqlite3`.
- `packages/sdk-ts` - Core TypeScript interfaces and Zod schemas shared across the monorepo.
- `packages/cli` - Command-line interface for managing the local stack.
- `sdk-python` - The production-hardened Python instrumentation SDK.

---

## [Advanced Workflows]

### 1. State Injection
AgentGlass allows you to pause your agents and modify their memory from the dashboard!

1. In your python code, add a wait block:
   ```python
   # The script will suspend here until you manually inject state from the UI
   new_state = client.wait_for_injection(trace_id, span_id, timeout=300)
   if new_state:
       my_agent_state.update(new_state)
   ```
2. Run your code. It will pause.
3. Open the AgentGlass dashboard, click on the paused node, edit the JSON in the sidebar, and click **Inject State**.
4. The Python execution will instantly resume with your overriding context!

### 2. Zero-Cost Debugging (VCR Cache)
Stop burning OpenAI credits while fixing a `KeyError` three steps deep in your agent chain. 

1. Import the AgentGlass VCR cache:
   ```python
   from agentglass_python import agentglass_vcr
   import openai
   ```
2. Wrap your heavy LLM execution logic:
   ```python
   @agentglass_vcr
   def run_llm(prompt):
       return openai.ChatCompletion.create(model="gpt-4", messages=[{"role": "user", "content": prompt}])
   ```
3. Run it once, and it will hit the network. Run it again, and it will return instantly. The Dashboard will render a sleek **"CACHE HIT"** badge on the node so you never lose track of what's real and what's simulated.
4. Clean the cache via CLI anytime: `agentglass cache clear`.

### 3. GitFork (Branch Comparison)
Use the new **Compare Traces** page to visually diff two different execution runs side-by-side.
1. Run your agent with Prompt A (creates Trace 1).
2. Tweak your agent and run it with Prompt B (creates Trace 2).
3. Open the Dashboard > **Compare Traces**. Select Trace 1 as Primary and Trace 2 as Compare.
4. Instantly see how your changes impacted the terminal payload!

---

## License
MIT
