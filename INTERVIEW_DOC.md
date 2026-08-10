# AgentGlass - Technical Interview Preparation Document

## 1. PROJECT SUMMARY
AgentGlass solves the critical problem of "silent failures" in autonomous multi-agent workflows by providing a local-first, deterministic time-travel debugger with zero network egress. When AI agents hallucinate or propagate corrupted context across deep execution graphs, standard logs are insufficient. AgentGlass enables engineers to scrub through exact execution states, compare branching traces, and manually inject runtime context without sending sensitive enterprise data to third-party cloud telemetry providers.

This problem matters because modern enterprise AI infrastructure (like what Atlan builds) processes highly sensitive metadata and relies on complex agentic routing. Debugging these flows requires deep visibility. AgentGlass is highly non-trivial because it implements real-time asynchronous background telemetry propagation in Python, handles massive context window state persistence without crushing DB IOps using blob offloading, and coordinates bidirectional "God Mode" state injection across separate daemon processes while maintaining microsecond deterministic replay accuracy.

## 2. ARCHITECTURE OVERVIEW

```text
+-------------------------------------------------------+
|  Python Target Application (LangGraph/LangChain)      |
|-------------------------------------------------------|
|  @with_agentglass           agentglass_vcr            |
|  instrument_langgraph()     ContextVars (trace/span)  |
|                                                       |
|  +-------------------------------------------------+  |
|  | AgentGlassClient (Background Thread Worker)     |  |
|  +-------------------------------------------------+  |
+---------+----------------------------^----------------+
          |                            |
    HTTP POST /v1/events         HTTP GET /v1/commands/poll
   (Batched, async flush)        (For God Mode Breakpoints)
          |                            |
+---------v----------------------------+----------------+
|  AgentGlass Daemon (Node.js Express + WebSocket)      |
|-------------------------------------------------------|
| - Schema Validation (Zod)                             |
| - Blob Offloader (>10KB payloads)                     |
| - RCA Engine (calls local Ollama)                     |
|                                                       |
|  +-----------------------+     +-------------------+  |
|  | better-sqlite3 (WAL)  |     | File System       |  |
|  | -> traces.db          |     | -> /blobs/*.json  |  |
|  +-----------------------+     +-------------------+  |
+--------------------------+----------------------------+
                           |
                     WebSocket Push 
                           |
+--------------------------v----------------------------+
|  AgentGlass Dashboard (Next.js 15 / React 19)         |
|-------------------------------------------------------|
| - State Management (Zustand)                          |
| - DAG Visualizer (@xyflow/react)                      |
| - Timeline Scrubber & Payload Inspector (Monaco)      |
+-------------------------------------------------------+
```

## 3. TECH STACK — EVERY DEPENDENCY EXPLAINED

| Library / Tool | Purpose | Why This vs Alternative |
| --- | --- | --- |
| **`better-sqlite3`** | Local DB layer for daemon | Synchronous and ultra-fast. Standard `sqlite3` driver in Node is async and introduces IPC overhead. WAL mode gives it excellent concurrent read/write throughput needed for local live telemetry. |
| **`httpx`** | Python HTTP Client | Thread-safe, async-capable HTTP. Chosen over `requests` because it supports modern async/await naturally, essential for high-throughput background flushing in `client.py`. |
| **`ws`** | WebSocket Server | Raw socket push for the daemon. Chosen over `Socket.io` to minimize client footprint and payload overhead. |
| **`zustand`** | React State | Deterministic timeline slicing. Chosen over Redux for boilerplate-free, un-opinionated state mutation which is perfect for scrubbing time-series data. |
| **`@xyflow/react`** | Graph UI | Renders the visual agent DAG. Chosen over D3 for immediate React-native component support and built-in panning/zooming. |
| **`dagre`** | Graph Layout | Calculates node coordinates. Chosen over manual math to automate complex, multi-branched LangGraph visualizations. |
| **`ContextVars` (Py)** | Tracing context | Implicitly passes trace/span IDs through async/sync boundaries. Overcomes the brittle nature of `threading.local` in `asyncio` loops. |

## 4. CORE MODULES — FILE BY FILE

- **`apps/daemon/src/index.ts`**
  - **Responsibility:** Ingests telemetry, offloads blobs, and broadcasts real-time states.
  - **Key Functions:** `persistEventBatch()` writes to SQLite. `readBody()` and `resolvePayload()` handle incoming data. `server.listen()` mounts endpoints.
  - **Tricks:** RCA engine conditionally calls `http://localhost:11434` (Ollama) on error nodes.

- **`apps/daemon/src/db.ts`**
  - **Responsibility:** Executes synchronous SQL queries using `better-sqlite3`.
  - **Key Functions:** `insertEvent()`, `getEventsByTrace()`, `getPendingCommands()`.
  - **Tricks:** Uses `PRAGMA journal_mode = WAL` to allow the dashboard to read traces without blocking the Python SDK from aggressively writing.

- **`apps/daemon/src/blobStore.ts`**
  - **Responsibility:** Prevents SQLite page bloat by offloading massive JSON contexts.
  - **Key Functions:** `writeBlob()`, `readBlob()`.
  - **Tricks:** Hashes payloads (`sha256`) to deduplicate identical massive context payloads seamlessly.

- **`sdk-python/src/agentglass_python/client.py`**
  - **Responsibility:** The core telemetry emitter.
  - **Key Classes:** `AgentGlassClient` runs a background `threading.Thread` pulling from a `queue.Queue`.
  - **Tricks:** `wait_for_injection()` polls the daemon and blocks the main thread precisely when "God Mode" UI interaction is needed.

- **`sdk-python/src/agentglass_python/langgraph_adapter.py`**
  - **Responsibility:** Wraps complex LangGraph apps transparently.
  - **Key Functions:** `instrument_langgraph()`.
  - **Tricks:** Monkey-patches `.invoke()` and `.astream()` to emit deterministic `agent_start`/`agent_end` events spanning the entire graph's lifecycle.

- **`sdk-python/src/agentglass_python/vcr.py`**
  - **Responsibility:** Implements zero-cost local LLM response caching.
  - **Key Classes:** `VCRCache`.
  - **Tricks:** Dynamically strips volatile fields (like `api_key`) before hashing `kwargs` to ensure deterministic cache hits even if transient variables change.

## 5. KEY ARCHITECTURAL DECISIONS — THE "WHY" LAYER

**1. Database Choice: Local SQLite with WAL mode**
- **Decision:** Store traces locally in `.agentglass/traces.db` using `better-sqlite3`.
- **Alternatives:** Postgres (Dockerized), Cloud DB, or pure In-Memory.
- **Why:** Zero config (no Docker required), keeps enterprise AI data 100% local, no latency overhead for UI. WAL mode handles the concurrent writes from the SDK and reads from the Dashboard.
- **Trade-offs:** Max data size is bound to local disk.
- **Change if requirements shift:** If deployed globally for a team, migrate `db.ts` to use PostgreSQL/Supabase and add authentication.

**2. State Communication: HTTP Polling for "God Mode"**
- **Decision:** Python SDK polls `/v1/commands/poll` via HTTP.
- **Alternatives:** Establishing a WebSocket from Python to the daemon.
- **Why:** Multi-threaded/async WebSocket clients in Python are notoriously unstable and interrupt application logic. HTTP polling is stateless, highly robust, and easy to drop into a blocking `time.sleep` loop inside `breakpoint()`.
- **Trade-offs:** Adds ~1s latency to UI injection commands.

**3. Data Storage Pattern: Blob Offloading**
- **Decision:** If an event's payload exceeds 10KB, write to `blobs/hash.json` and store `{"$blob": "hash"}` in SQLite.
- **Alternatives:** Store everything as `TEXT` in SQLite, or compress `TEXT` with zlib.
- **Why:** AI prompts and conversation histories regularly exceed hundreds of kilobytes. Storing these inline would thrash SQLite's page cache and grind `SELECT * FROM events` UI queries to a halt.
- **Trade-offs:** Disk fragmentation, orphaned files if DB is wiped. 

**4. Context Threading: `ContextVars`**
- **Decision:** Implicitly thread `trace_id` and `span_id` using Python's `contextvars`.
- **Alternatives:** Explicitly passing `client` and `span_id` as kwargs to every function.
- **Why:** AI developers use deep nested stacks. Forcing them to pass a `trace_id` param ruins DX. `ContextVar` natively propagates across async tasks.

## 6. DATA FLOWS — TRACE THE MOST IMPORTANT OPERATIONS

**1. Telemetry Ingestion (Hot Path)**
- **Step 1:** `@with_agentglass` decorator calls `client.track()`.
- **Step 2:** `AgentGlassEvent` is validated via Pydantic and put on a thread-safe `queue.Queue`.
- **Step 3:** `_run_worker` thread pops up to 50 events, batches them, and POSTs to `/v1/events`.
- **Step 4:** `index.ts` validates via Zod `IncomingEventSchema`.
- **Step 5:** Payload length is checked; if >10KB, `blobStore.writeBlob()` saves to disk.
- **Step 6:** Event is persisted via `db.ts` `insertEventBatch()`.
- **Step 7:** `broadcastEvent()` fires to all connected UI clients via `WebSocketServer`.

**2. God Mode Breakpoint & Injection**
- **Step 1:** Python hits `client.breakpoint()`, emits a `breakpoint` event, and enters a while-loop calling `poll_commands()`.
- **Step 2:** User clicks "Inject" in the Next.js UI, POSTing to daemon `/v1/commands`.
- **Step 3:** Daemon saves command to SQLite `commands` table with status `pending`.
- **Step 4:** Python polls, receives command, auto-acknowledges, parses payload, and breaks the loop.
- **Step 5:** Python emits `state_injection` event to audit-log the intervention.

**3. Local RCA Auto-Analysis**
- **Step 1:** Dashboard spots an `error` event, user clicks "Analyze".
- **Step 2:** Dashboard GETs `/v1/traces/:id/spans/:id/analyze`.
- **Step 3:** Daemon fetches surrounding 5 trace events for context.
- **Step 4:** Daemon POSTs a zero-shot prompt to `http://localhost:11434/api/generate` (Ollama).
- **Step 5:** Ollama returns structured JSON (root cause, fix). Daemon caches it in `rca_results` table.

## 7. CONFIGURATION & ENVIRONMENT

**Environment Variables:**
- `AGENTGLASS_DAEMON_HOST` (default: 127.0.0.1)
- `AGENTGLASS_DAEMON_PORT` (default: 8765)
- `AGENTGLASS_DATA_DIR` (default: `./.agentglass` — controls DB/Blob storage)
- `AGENTGLASS_RCA_MODEL` (default: `llama3.2:3b` — controls Ollama target)

**Running Locally:**
```bash
# Start monorepo apps (Daemon + Dashboard)
pnpm dev:up

# Export test
python sdk-python/examples/e2e_stress_test.py
```

## 8. WHAT COULD GO WRONG — FAILURE MODES

| Component | Likely Failure Mode | Current Handling | Production Fix |
| --- | --- | --- | --- |
| **Python Queue** | Heavy tracing outpaces HTTP flushing, filling memory. | Unbounded `queue.Queue` absorbs spikes, retries on HTTP error. | Implement `maxsize=1000` with LIFO ring-buffer or drop events with a `logging.warning`. |
| **SQLite DB** | `SQLITE_BUSY` contention from simultaneous read/writes. | Uses `WAL` mode. | Move to batched memory-inserts before disk flush, or PostgreSQL if scaled to team level. |
| **Blob Offload** | Dashboard fetches trace with dead `$blob` reference. | UI displays raw `{"$blob": "hash"}` string silently. | Add strict foreign-key style checks and garbage collection for `.agentglass/blobs/`. |
| **ContextVars** | Losing context when passing into `ThreadPoolExecutor`. | `ContextVar` natively works in `asyncio` but drops in fresh threads. | Manually copy context via `contextvars.copy_context().run()`. |

## 9. WHAT I WOULD CHANGE IF REBUILDING

**Over-engineered for current scope:**
1. **Blob Offload threshold (10KB):** SQLite handles 100KB+ `TEXT` rows trivially. The limit should be raised to 500KB to reduce file I/O overhead.
2. **Terminal UI (TUI):** Building `textual` bindings inside the SDK adds heavy dependencies for an interface that is visually inferior to the web dashboard.
3. **Double serialization:** Converting Pydantic to JSON to dict in Python, POSTing, and re-parsing Zod in TypeScript is heavy.

**Would break at 10x scale:**
1. **WebSocket Bootstrapping:** The daemon `bootstrap` message dumps `getRecentEvents(200)`. If traces grow massively, initial UI load will freeze the browser. Needs pagination.
2. **SQLite Group By:** `queryTracesStmt` scans the entire `events` table to calculate `event_count` and `has_error`. At 1M+ rows, this dashboard query will hang. Needs a materialized `traces` summary table.
3. **Synchronous Polling:** `wait_for_injection` polling interval is 1s, which blocks event loops slightly. 

**Architectural Abstractions:**
1. **Leaky Abstraction:** `$blob` payload replacement modifies the true schema of the `payload` dict, forcing the UI to sniff for `$blob` keys.
2. **Right Call:** `VCRCache`. Stripping volatile LLM config args before hashing the prompt saved massive API costs and made debugging perfectly deterministic.

## 10. INTERVIEW TALKING POINTS — READY TO USE

1. "In `apps/daemon/src/index.ts`, I built a blob offloading pattern for payloads >10KB because injecting huge LangChain message arrays inline crushes SQLite read latency. The trade-off was managing orphaned files on disk, and I'd handle it differently in production by utilizing S3 or a dedicated document store."
2. "In `sdk-python/src/agentglass_python/client.py`, I implemented a background threading worker with a thread-safe `queue.Queue`. The trade-off was potential memory bloat if the network drops, and I'd fix it by adding a circular ring buffer limit."
3. "In `sdk-python/src/agentglass_python/langgraph_adapter.py`, I hooked `.invoke` and `.astream` because standard LangChain callbacks lack root-level execution context isolation. The trade-off is coupling to internal APIs, but it provided zero-config UX for the developer."
4. "In `apps/daemon/src/db.ts`, I explicitly enabled `pragma journal_mode=WAL` because without it, simultaneous HTTP writes from Python and WS reads from the dashboard would throw `SQLITE_BUSY` locks."
5. "In `sdk-python/src/agentglass_python/vcr.py`, I dynamically stripped volatile fields like `api_key` and `timeout` before hashing `kwargs`. This ensured deterministic cache hits even if transient variables changed, which is critical for time-travel debugging."
6. "In `apps/daemon/src/index.ts`, I used HTTP polling for the God Mode `breakpoint` instead of WebSockets. The trade-off was a 1-second injection latency, but it avoided breaking Python's brittle `asyncio` thread boundaries."
7. "In `sdk-python/src/agentglass_python/client.py`, I utilized `ContextVar` to implicitly propagate `trace_id` and `span_id`. The trade-off is edge-cases when spawning `ThreadPoolExecutor`, but it removes the need to pass context objects through every function."
8. "In the Next.js `dashboard`, I chose Zustand over Redux for timeline state slicing. The trade-off is less strict unidirectional flow, but it allowed me to perfectly rewind the execution graph without boilerplate."
9. "In `apps/daemon/src/index.ts`, I implemented an RCA Engine that intercepts errors and POSTs surrounding trace context to a local Ollama instance. The trade-off is an assumption of local hardware capability, but it ensures enterprise data never leaves the machine."
10. "In `sdk-python/examples/e2e_stress_test.py`, I validated the exact idempotency of the daemon. We generated duplicate `event_id` keys intentionally to prove the `INSERT OR IGNORE` SQLite strategy prevented duplicate telemetry artifacts from network flushes."

## 11. LIKELY INTERVIEW QUESTIONS & ANSWERS

**1. Q: Why did you choose better-sqlite3 over a robust database like PostgreSQL?**
> A: AgentGlass is designed to be a "Local-First" debugger. Imposing a Docker/Postgres dependency violates the "zero-config" ethos. By using `better-sqlite3` with WAL mode, we achieve massive synchronous throughput that rivals Postgres on a single node without any networking overhead.

**2. Q: How does your Python SDK handle the network overhead of sending telemetry?**
> A: It uses a non-blocking background thread. The hot path simply places a Pydantic `AgentGlassEvent` object onto a `queue.Queue`. The background worker batches up to 50 events and flushes them via `httpx` every 250ms, ensuring the AI application's latency is unaffected.

**3. Q: If an agent runs for 30 minutes, how do you prevent your queue from eating all RAM?**
> A: Currently, the queue is unbounded, which relies on the daemon being faster than the agent. In a production Atlan environment, I would enforce `maxsize=10,000` on the queue and drop older events (with a metrics warning) to prevent OOM kills.

**4. Q: How did you implement tracing context propagation without forcing users to pass IDs everywhere?**
> A: I used Python 3.7+ `contextvars`. When a span starts, `_current_span_id.set()` stores the ID, which natively flows down through async execution graphs. When nested functions call `@with_agentglass`, they read `parent_span_id` implicitly.

**5. Q: What happens if an LLM returns a 5MB response? Will it crash the dashboard?**
> A: No. The Node.js daemon intercepts payloads larger than 10KB and writes them directly to the `.agentglass/blobs` file system. The DB only stores a `{ "$blob": "sha256" }` pointer, keeping the UI queries lightning fast.

**6. Q: How does the "God Mode" state injection actually work technically?**
> A: The Python script hits `breakpoint()` and enters a blocking while-loop, polling the daemon's `/v1/commands/poll` endpoint. When a user clicks "Inject" in the UI, the daemon stores it in SQLite. Python fetches it, auto-acknowledges it, parses the payload, and breaks the loop to resume execution with the new state.

**7. Q: How did you handle deduplication? Networks are flaky, what if Python flushes twice?**
> A: Idempotency is enforced at the DB layer. Python generates a unique `event_id` (UUIDv4) upon creation. The daemon uses `INSERT OR IGNORE INTO events (ingest_id...)` to silently drop duplicates.

**8. Q: Why patch LangGraph's invoke instead of just using standard LangChain Callbacks?**
> A: LangChain's `BaseCallbackHandler` doesn't provide a clean way to capture the absolute root input/output of the compiled graph as a single overarching span. By wrapping `invoke` and `astream`, we inject a master `agent_start` span, attach the callback handler to its `parent_span_id`, and guarantee a perfect DAG structure.

**9. Q: How does the VCR cache ensure it doesn't serve stale responses if the prompt changes slightly?**
> A: `VCRCache._hash()` deterministically strips non-semantic arguments (like API keys and timeouts), serializes the dictionary with `sort_keys=True`, and creates a SHA-256 hash. If the temperature or prompt strings change even slightly, a new hash is generated, bypassing the cache.

**10. Q: If you were scaling this to support a team of 50 AI engineers, what breaks first?**
> A: The `queryTracesStmt` SQL query in `db.ts` uses `GROUP BY trace_id` across the entire `events` table to find the latest traces. With 50 engineers emitting millions of events, that query will lock up. I'd add a materialized `trace_metadata` table.

**11. Q: How does AgentGlass compare to LangSmith?**
> A: LangSmith is cloud-centric and charges per trace. AgentGlass is explicitly local-first. It sacrifices global team collaboration in exchange for zero-latency UI updates, zero data egress (critical for enterprise PII/PHI), and the ability to manually halt and inject state into a running process locally.

**12. Q: Explain the logic behind your OpenTelemetry integration.**
> A: I built `AgentGlassSpanProcessor` which extends OTel's `SpanProcessor`. It heuristically maps OTel `SpanKind` attributes (like `CLIENT` or `SERVER`) to AgentGlass `event_type` strings (`llm_request`, `agent_start`). This allows enterprise teams to keep their standard OTel instrumentation but stream live data directly into AgentGlass.

**13. Q: How do you handle exceptions in the Python agent without crashing the telemetry loop?**
> A: Inside the `@with_agentglass` wrapper, execution is wrapped in a `try/except/finally`. If an exception is caught, we emit an `event_type="error"` payload containing the stack trace, then re-raise the exception so the host application behaves normally.

**14. Q: If the local Ollama instance is down, does the RCA engine crash the daemon?**
> A: No. The `analyze` endpoint wraps the `fetch` call to port 11434 in a `try/catch`. If it fails, it returns a gracefully degraded `fallbackAnalysis` mock payload instructing the user to start Ollama.

**15. Q: What is the most complex piece of state management in the React Dashboard?**
> A: Synchronizing the DAG Visualizer (`@xyflow/react`) with the Time-Travel scrubber. Using Zustand, I map the `currentTime` to the trace's `events` array. The UI recalculates which nodes are active/completed by replaying the events up to that timestamp, ensuring the graph perfectly mirrors historical state.

---
*Confirming:* I have read 39 files and roughly ~2,500 total lines of code.
