# AgentGlass Deep Technical Documentation
*Prepared for Atlan Enterprise Context Layer Interview*

---

## SECTION A: OPENTELEMETRY IMPLEMENTATION AUDIT

### Initialization and Configuration
The OpenTelemetry integration in AgentGlass is not a standard OTel `Exporter`. Instead, it is implemented as a custom `SpanProcessor` located in `sdk-python/src/agentglass_python/otel.py`.
Developers initialize it by attaching it to their existing OTel `TracerProvider`.

### Spans Created
`AgentGlassSpanProcessor` intercepts every `ReadableSpan`. It maps standard OTel `SpanKind` to AgentGlass `event_type` strings:
- `SpanKind.CLIENT` -> `llm_request` (start) / `llm_response` (end)
- `SpanKind.SERVER` -> `agent_start` (start) / `agent_end` (end)
- `SpanKind.INTERNAL` -> `tool_call` (start) / `tool_result` (end)
- It captures all OTel attributes (e.g., `span.attributes.items()`) and dumps them into the AgentGlass `payload`.
- Any OTel Events (`span.events`) attached to the span are serialized into `payload.otel_events`.
- If `span.status.is_ok` is false on end, it emits an `error` event type.

### Span Tree Structure for Multi-Agent Execution
```
Trace (id: 12345)
└── [agent_start] Node: Orchestrator (Span: A)
    ├── [agent_start] Node: ResearchAgent (Span: B, Parent: A)
    │   ├── [tool_call] Node: WebSearch (Span: C, Parent: B)
    │   └── [tool_result] Node: WebSearch (Span: C, Parent: B)
    ├── [agent_end] Node: ResearchAgent (Span: B, Parent: A)
    ├── [llm_request] Node: gpt-4o (Span: D, Parent: A)
    └── [llm_response] Node: gpt-4o (Span: D, Parent: A)
└── [agent_end] Node: Orchestrator (Span: A)
```

### GenAI Semantic Conventions Compliance
AgentGlass **does not natively enforce** the OpenTelemetry GenAI Semantic Conventions (e.g., `gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`). 
The `_extract_attributes` function simply extracts whatever attributes the underlying instrumentation (like `opentelemetry-instrumentation-langchain`) provides. It acts as a heuristic pass-through rather than a strongly-typed schema validator.

### What's Missing for Production
1. **Context Propagation:** It does not implement `W3C TraceContext` standard injection/extraction across network boundaries. It relies on local Python `ContextVars`.
2. **Resource Attributes:** OTel `Resource` (host, service.name, deployment.environment) is completely ignored and dropped.
3. **True Exporter Implementation:** A production system would implement an OTLP `SpanExporter` rather than a `SpanProcessor`, allowing telemetry to be batched and sent via gRPC alongside standard pipelines.

---

## SECTION B: EVENT SOURCING IMPLEMENTATION AUDIT

### SQLite Schema (`apps/daemon/src/db.ts`)
```sql
CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ingest_id       TEXT    NOT NULL UNIQUE,
  trace_id        TEXT    NOT NULL,
  span_id         TEXT    NOT NULL,
  parent_span_id  TEXT,
  event_type      TEXT    NOT NULL,
  node_name       TEXT    NOT NULL DEFAULT '',
  payload         TEXT,
  timestamp       INTEGER NOT NULL,
  ingest_timestamp INTEGER NOT NULL,
  schema_version  TEXT    NOT NULL DEFAULT '0.1.0'
);

CREATE INDEX IF NOT EXISTS idx_events_trace     ON events(trace_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp  ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_span       ON events(span_id);
```

### Event Types Stored
| Event Type | Emitted When | Payload Shape |
| --- | --- | --- |
| `agent_start` | Agent/chain execution begins | `{ inputs: {...}, metadata: {...} }` |
| `agent_end` | Agent/chain completes successfully | `{ outputs: {...} }` |
| `error` | Exception thrown during execution | `{ message: "...", type: "ValueError" }` |
| `tool_call` | Tool invocation begins | `{ input: "..." }` |
| `tool_result` | Tool invocation returns data | `{ result: "..." }` |
| `llm_request` | Sending prompt to LLM API | `{ model: "gpt-4", prompts: [...] }` |
| `llm_response` | Receiving completion from LLM | `{ response: "...", cache_hit: true }` |
| `breakpoint` | SDK hits `breakpoint()` | `{ status: "paused" }` |
| `state_injection` | User injects state via UI | `{ [field]: value }` (Arbitrary injected state) |
| `god_mode_command`| Dashboard POSTs to daemon | `{ command_id: "...", type: "inject", data: "..." }` |

### Code Path: Agent -> SQLite
1. Python code hits `client.track_event()`.
2. Event is validated via Pydantic and added to `client._queue`.
3. `_run_worker` background thread pops event, adds to batch, sends `HTTP POST /v1/events`.
4. `index.ts` Express server receives payload, validates via `IncomingEventSchema` (Zod).
5. `preparePayload()` checks if JSON length > 10KB. If so, writes to filesystem and replaces with `{"$blob": "hash"}`.
6. `insertEventBatch()` executes `INSERT OR IGNORE` into `traces.db`.

### Event Replay Implementation (`apps/dashboard/app/lib/eventHelpers.ts`)
Event replay happens on the frontend by recalculating graph node states from an ordered array of events.

```typescript
export function deriveNodesFromEvents(events: PersistedEvent[]): Map<string, GraphNode> {
  const nodes = new Map<string, GraphNode>(); // 1. Initialize map to hold computed state

  for (const event of events) { // 2. Iterate through events chronologically
    const existing = nodes.get(event.span_id); // 3. Check if we've seen this span

    if (existing) {
      existing.events.push(event); // 4. Append event to span history
      existing.eventCount++;
      existing.lastTimestamp = Math.max(existing.lastTimestamp, event.timestamp);

      // 5. State Machine Transition based on latest event
      if (event.event_type === "error") {
        existing.status = "error";
      } else if (event.event_type === "breakpoint") {
        existing.status = "paused";
      } else if (event.event_type === "state_injection") {
        if (existing.status === "paused") existing.status = "running";
      } else if (event.event_type === "agent_end") {
        if (existing.status !== "error") existing.status = "completed";
      } else if (
        event.event_type === "agent_start" &&
        existing.status !== "error" &&
        existing.status !== "completed" &&
        existing.status !== "paused"
      ) {
        existing.status = "running";
      }

      // 6. Backfill node name if missing
      if (!existing.nodeName && event.node_name) {
        existing.nodeName = event.node_name;
      }
    } else {
      // 7. Initial Node Creation based on first seen event
      let status: NodeStatus = "idle";
      if (event.event_type === "error") status = "error";
      else if (event.event_type === "breakpoint") status = "paused";
      else if (event.event_type === "agent_start") status = "running";
      else if (event.event_type === "agent_end") status = "completed";

      nodes.set(event.span_id, {
        spanId: event.span_id,
        parentSpanId: event.parent_span_id,
        nodeName: event.node_name || event.span_id.slice(0, 8),
        status,
        eventCount: 1,
        events: [event],
        firstTimestamp: event.timestamp,
        lastTimestamp: event.timestamp,
      });
    }
  }

  return nodes; // 8. Return final computed state
}
```

### Snapshots & Scalability
There is a `state_snapshot` event type in the schema, but **there is no snapshot truncation logic** in the replay mechanism. Every replay loops through the entire `events` array from `index 0` to `n`. 
**At scale:** If an agent runs for hours generating 10,000+ events, the React frontend will freeze attempting to recalculate `deriveNodesFromEvents()` on every timeline scrub. A production system must implement bounded snapshots (e.g., emitting full state every 100 events) and truncate the replay loop to start from the nearest preceding snapshot.

---

## SECTION C: WEBSOCKET INGESTION ENGINE DEEP DIVE

### WebSocket Server Initialization (`apps/daemon/src/index.ts`)
```typescript
// 1. Create headless WS server (does not mount to port automatically)
const wsServer = new WebSocketServer({ noServer: true });

// 2. Thread-safe (in Node) Set of connected clients
const wsClients = new Set<WebSocket>();

wsServer.on("connection", (socket) => {
  wsClients.add(socket); // 3. Register client

  // 4. Send historical bootstrap data immediately on connect
  const recentEvents = getRecentEvents(200).map(rowToJson);
  socket.send(JSON.stringify({ type: "bootstrap", events: recentEvents }));

  socket.on("close", () => {
    wsClients.delete(socket); // 5. Cleanup on disconnect
  });
});

// 6. Intercept HTTP upgrade requests to handle WS handshake manually
server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/ws") {
    socket.destroy();
    return;
  }
  wsServer.handleUpgrade(req, socket, head, (client) => {
    wsServer.emit("connection", client, req);
  });
});
```

### Connection Handling
Multiple connections are handled using a standard JS `Set<WebSocket>()`. Because Node.js is single-threaded, `Set.add` and `Set.delete` are inherently thread-safe. However, **there is no connection pooling, scaling across processes, or Redis pub/sub backplane**. It is strictly limited to a single Node process.

### Message Format
Events are broadcast as JSON strings:
```json
{
  "type": "event",
  "event": {
    "ingest_id": "c1a2b3-...",
    "trace_id": "trace-999",
    "span_id": "span-123",
    "parent_span_id": null,
    "event_type": "llm_response",
    "node_name": "gpt-4o",
    "payload": { "response": "Hello World", "cache_hit": true },
    "timestamp": 1715456789000000,
    "ingest_timestamp": 1715456789005000,
    "schema_version": "0.1.0"
  }
}
```

### Dropped Connections & Backpressure
- **Dropped Connection:** If a WS connection drops mid-execution, the server simply deletes the socket from the `Set`. The frontend handles reconnects (in `useDaemonSocket.ts`) and must manually fetch missed events via `HTTP GET /v1/traces/:id/events`. There is no server-side message queueing for offline clients.
- **Backpressure:** The daemon has **zero backpressure handling**. If events are ingested via HTTP faster than they can be serialized and written to the TCP socket buffer, Node.js will buffer them in memory until it throws an `OOM (Out of Memory)` exception. Production WS servers require high-water mark pausing.

---

## SECTION D: VCR LLM CACHING MECHANISM

### API Intercept
LLM API calls are intercepted via the `@agentglass_vcr` decorator (`sdk-python/src/agentglass_python/vcr.py`), which wraps functions and checks the local cache before allowing the underlying HTTP request to execute.

### Cache Key Computation
The cache key is computed as a SHA-256 hash of the model name combined with a deterministically serialized dictionary of kwargs. Volatile fields (`api_key`, `timeout`, `client`) are stripped out.
```python
clean_kwargs = {k: v for k, v in kwargs.items() if k not in ("api_key", "timeout", "client")}
serialized = json.dumps(clean_kwargs, sort_keys=True, default=str)
return hashlib.sha256(f"{model}:{serialized}".encode('utf-8')).hexdigest()
```

### Storage and Eviction
- **Storage:** Local SQLite database at `.agentglass/vcr_cache.db` in table `llm_cache`.
- **Eviction Policy:** There is **no eviction policy**. If the database fills up, it fails. On hash collision, it uses `INSERT OR REPLACE` to overwrite the existing entry. Users must manually clear it.

### State Injection Mechanism (`client.py`)
```python
def breakpoint(self, name: str = "Breakpoint", trace_id: str | None = None, span_id: str | None = None):
    # 1. Emit breakpoint event so UI knows to pause
    self.track_event(event_type="breakpoint", node_name=name, ...)
    
    # 2. Blocking while-loop (stops agent execution thread)
    while not self._stop_event.is_set():
        # 3. HTTP GET to daemon to check for pending commands
        commands = self.poll_commands(tid, sid)
        for cmd in commands:
            if cmd['command_type'] == 'inject':
                payload = json.loads(cmd['payload'])
                # 4. Emit audit log of the injection
                self.track_event(event_type="state_injection", payload=payload, ...)
                # 5. Return the payload to the running agent code
                return payload
        time.sleep(1.0) # 6. Avoid hammering the daemon
    return None
```
**Incompatible State:** If the dashboard user injects a payload that structurally breaks the agent's expected data schema, the Python agent will throw a standard runtime exception (e.g., `KeyError` or Pydantic validation error) immediately after `breakpoint()` returns. AgentGlass catches this (if inside `@with_agentglass`), emits an `error` event, and the agent halts.

---

## SECTION E: THE CODE I NEED TO EXPLAIN LINE BY LINE

### 1. LangGraph Monkey Patching (`langgraph_adapter.py`)
```python
# Save references to LangGraph's original execution methods
original_invoke = graph.invoke
original_ainvoke = getattr(graph, "ainvoke", None)

# Define our wrapper function for standard invoke
def instrumented_invoke(input_data: Any, *args: Any, **kwargs: Any) -> Any:
    # 1. Manually emit the "root" start span for the entire graph.
    # Standard LangChain callbacks do not capture the absolute top-level inputs well.
    client.track(AgentGlassEvent(trace_id=tid, span_id=root_sid, event_type="agent_start", ...))

    # 2. Use ContextVars to push trace_id/span_id so inner functions can read it automatically.
    t_token = _current_trace_id.set(tid)
    s_token = _current_span_id.set(root_sid)

    try:
        # 3. Inject our custom BaseCallbackHandler into LangGraph's config kwargs
        kwargs = _prepare_kwargs(kwargs)
        # 4. Execute the original LangGraph logic
        result = original_invoke(input_data, *args, **kwargs)

        # 5. Emit the successful completion of the entire graph
        client.track(AgentGlassEvent(event_type="agent_end", payload={"output": result}))
        return result
    except Exception as error:
        # 6. Catch graph crashes and emit as a dedicated error event
        client.track(AgentGlassEvent(event_type="error", payload={"message": str(error)}))
        raise # Rethrow to preserve native behavior
    finally:
        # 7. Clean up ContextVars to prevent memory leaks across async tasks
        _current_trace_id.reset(t_token)
        _current_span_id.reset(s_token)

# Override the object's methods with our wrappers
graph.invoke = instrumented_invoke
```
**Algorithm:** Monkey-patching. We intercept the method call, set up local context, push our listener into the framework's config, call the original method, and intercept the return/error. 
**Why:** Simpler alternatives (like just passing a callback list to `.invoke()`) fail to wrap the absolute topmost execution boundary and fail to propagate implicit Trace Context to non-LangChain tool functions.

### 2. Async Background Flusher (`client.py`)
```python
def _run_worker(self) -> None:
    pending: list[AgentGlassEvent] = []
    interval_seconds = self.flush_interval_ms / 1000 # Convert ms to seconds for time logic
    last_flush = time.monotonic() # High-resolution, non-decreasing clock

    # Run loop until client is closed AND queue/pending buffers are empty
    while not self._stop_event.is_set() or not self._queue.empty() or pending:
        try:
            # Block and wait for an event, up to the flush interval limit
            event = self._queue.get(timeout=interval_seconds)
            pending.append(event)
        except queue.Empty:
            pass # Timeout reached, no new events

        # Check if we should flush: Did we hit max batch size OR time interval?
        elapsed = time.monotonic() - last_flush
        should_flush = len(pending) >= self.max_batch_size or elapsed >= interval_seconds

        if should_flush and pending:
            # Pop items off pending array up to batch limit
            batch = self._drain_batch(pending)
            # Make HTTP POST to Daemon
            self._flush(batch)
            last_flush = time.monotonic()
```
**Algorithm:** Time-bounded, size-bounded asynchronous buffering queue. 
**Why:** Writing HTTP requests inline inside the agent's logic would add 50ms+ latency to every LangChain step. This ensures the agent runs at full speed while telemetry flushes independently.

### 3. Blob Offloading Strategy (`index.ts`)
```typescript
function preparePayload(payloadObj: unknown): string {
  const payloadStr = JSON.stringify(payloadObj ?? {});
  
  // 1. If payload is greater than 10KB
  if (payloadStr.length > BLOB_THRESHOLD_BYTES) {
    // 2. Hash string (sha256) and write to `.agentglass/blobs/hash.json`
    const hash = writeBlob(payloadStr);
    // 3. Return a pointer object stringified instead of the massive payload
    return JSON.stringify({ $blob: hash });
  }
  // 4. Return original payload for small events
  return payloadStr;
}

function resolvePayload(payloadObj: any): any {
  // 5. When reading, sniff for the pointer signature
  if (payloadObj && typeof payloadObj === "object" && typeof payloadObj.$blob === "string") {
    // 6. Fetch from disk synchronously
    const raw = readBlob(payloadObj.$blob);
    if (raw) {
      try {
        return JSON.parse(raw); // 7. Hydrate back to JSON
      } catch {
        return raw;
      }
    }
  }
  return payloadObj;
}
```
**Algorithm:** Pointer-based payload eviction (Blob Offloading). 
**Why:** Multi-agent systems pass around 100,000+ token context arrays. Storing megabytes of string data inline in SQLite row columns causes severe read fragmentation and locks the UI up during `SELECT *`. Offloading to filesystem guarantees DB operations stay under 1ms.

---

## SECTION F: WHAT AN ATLAN ENGINEER WOULD CRITIQUE

1. **Schema Survivability (10M+ Events):**
   - *Critique:* The schema will completely fail at 10M events. The `queryTracesStmt` relies on a full table scan `GROUP BY trace_id` to aggregate metadata (event counts, start times).
   - *Fix:* Atlan would require a CQRS or materialized view architecture. A `traces` table must be updated via a database trigger on insert, eliminating the `GROUP BY`.

2. **OTel Standards Compliance:**
   - *Critique:* It is not compliant for enterprise use. By forcing everything through a custom `SpanProcessor` and ignoring W3C Trace Context, AgentGlass traces cannot stitch together with distributed services (e.g., if a Python agent calls an external Java microservice).
   - *Fix:* Must use standard `OTLPSpanExporter` and properly map semantic conventions instead of heuristic payload dumps.

3. **WebSocket Production Safety:**
   - *Critique:* Dangerous. It lacks ping/pong heartbeats to drop dead connections, connection limits, and backpressure. 100 concurrent agents emitting dense trace logs will overwhelm the Node.js event loop causing OOM crashes.
   - *Fix:* Integrate Redis Pub/Sub for scale-out, implement message dropping/sampling under heavy load, and add socket heartbeats.

4. **Missing Governance/Security:**
   - *Critique:* Zero RBAC (Role-Based Access Control) and zero PII masking. In an enterprise, developers cannot be allowed to read raw LLM prompts that might contain customer SSNs or credentials.
   - *Fix:* Implement payload obfuscation pipelines (e.g., regex redaction before SQLite insertion) and authentication middleware on the Express routes.

5. **Multi-Tenancy:**
   - *Critique:* The current design assumes a single developer (`traces.db`). 
   - *Fix:* A `tenant_id` column must be added to all tables as a composite primary key. The WS connection URL must accept a JWT identifying the tenant, ensuring sockets only broadcast events belonging to that tenant.

---

## SECTION G: 20 SPECIFIC INTERVIEW Q&As

**Q1: How did you prevent the Python client from blocking the agent's main execution loop?**
A: "In `client.py:AgentGlassClient._run_worker`, I used a background `threading.Thread` pulling from a thread-safe `queue.Queue`. The reason was that waiting on network I/O during LLM orchestration severely impacts performance. Looking at the code, you can see I combined a size threshold (`max_batch_size`) with a time threshold (`flush_interval_ms`). The trade-off I accepted was potential memory buildup if the daemon goes offline, since the queue is unbounded."

**Q2: Why did you use `better-sqlite3` instead of the native async Node.js `sqlite3`?**
A: "In `apps/daemon/src/db.ts`, I utilized `better-sqlite3`. The reason was that standard SQLite in Node requires asynchronous IPC overhead that slows down heavy single-node insert workloads. Looking at the code, you can see I configured `PRAGMA journal_mode = WAL`. The trade-off I accepted was relying on a synchronous C++ binding, which blocks the Node event loop marginally during writes, but guarantees massive throughput."

**Q3: How do you handle giant LangChain conversational context arrays in the database?**
A: "In `apps/daemon/src/index.ts:preparePayload`, I implemented a Blob Offloading pattern. The reason was that inserting 500KB JSON payloads directly into SQLite crushes read latency for the dashboard. Looking at the code, you can see it intercepts strings >10KB, writes them to disk, and saves a `{"$blob": "hash"}` pointer in the DB. The trade-off I accepted was the complexity of managing orphaned files on disk."

**Q4: How did you implement tracing across async Python boundaries without explicitly passing trace IDs?**
A: "In `client.py`, I defined `_current_trace_id` as a `ContextVar`. The reason was that passing tracing kwargs through every function call destroys Developer Experience. Looking at the code, you can see `track_event()` pulls from `_current_trace_id.get()` automatically. The trade-off I accepted was the fact that `ContextVars` don't automatically propagate if the user spawns a manual raw Thread, requiring them to use `contextvars.copy_context().run()`."

**Q5: What happens if an agent fails and throws an exception inside your telemetry wrapper?**
A: "In `instrumentation.py:@with_agentglass`, I wrapped the execution in a `try/except` block. The reason was to guarantee we catch silent failures. Looking at the code, you can see it emits an `event_type='error'` containing the stack trace, and then immediately `raise`s the exception. The trade-off I accepted is adding try/catch overhead to every single function execution."

**Q6: Why did you monkey-patch LangGraph's `.invoke()` instead of using standard Callbacks?**
A: "In `langgraph_adapter.py:instrument_langgraph`, I overrode the `graph.invoke` method. The reason was that standard LangChain `BaseCallbackHandler` instances don't natively capture the absolute top-level graph inputs as a unified parent span. Looking at the code, you can see I emit an `agent_start` before executing the original `invoke`. The trade-off I accepted was coupling my SDK to LangGraph's internal API surface, making it brittle to framework updates."

**Q7: How did you make the VCR cache deterministic even when transient variables like API keys change?**
A: "In `vcr.py:VCRCache._hash`, I sanitize the input parameters before hashing. The reason was that a cache miss occurs if a user changes a `timeout` config, which defeats the purpose of deterministic replay. Looking at the code, you can see I strip keys like `api_key` and `timeout`, then use `sort_keys=True` in JSON serialization. The trade-off I accepted was a hardcoded list of 'volatile' fields to ignore."

**Q8: How does the dashboard timeline calculate the state of the graph at a specific point in time?**
A: "In `useTraceStore.ts:useSelectedTraceEvents`, I implemented a pure selector function. The reason was to support scrubbing backward in time. Looking at the code, you can see it filters the raw event array where `timestamp <= playbackTimestamp`. The trade-off I accepted was forcing the React frontend to re-calculate the entire DAG state on the fly, which gets sluggish if a trace has thousands of events."

**Q9: If the network connection is flaky, how do you prevent duplicating traces on retry?**
A: "In `apps/daemon/src/db.ts:insertStmt`, I utilized an `INSERT OR IGNORE` SQL strategy. The reason was that HTTP retries from the Python client could lead to duplicate data. Looking at the code, you can see the Python client assigns a unique `event_id` (UUIDv4) upon creation, making the ingestion idempotent. The trade-off I accepted was silent failure masking; if a genuine collision happens, it's silently swallowed."

**Q10: How does the "God Mode" mechanism physically pause a running Python program?**
A: "In `client.py:breakpoint`, I used a synchronous blocking `while` loop. The reason was that we need to halt the agent thread while waiting for human input from the UI. Looking at the code, you can see a `time.sleep(1.0)` loop that polls `/v1/commands/poll` via HTTP. The trade-off I accepted was up to 1 second of latency between clicking 'Inject' in the UI and the agent actually resuming."

**Q11: Why didn't you use WebSockets for the Python-to-Daemon communication?**
A: "In `client.py`, I relied exclusively on `httpx` POST and GET polling. The reason was that managing WebSocket lifecycles within complex, deeply nested, multi-threaded Python asyncio applications is incredibly brittle. Looking at the code, you can see polling is completely stateless. The trade-off I accepted was increased network overhead due to HTTP headers on every poll."

**Q12: How does the dashboard receive real-time updates?**
A: "In `apps/daemon/src/index.ts`, I attached a `ws` WebSocketServer to the Express HTTP server upgrade event. The reason was to push UI updates instantly without requiring the browser to long-poll. Looking at the code, you can see `broadcastEvent()` iterates over a `Set<WebSocket>` on every successful SQLite insertion. The trade-off I accepted was a lack of horizontal scalability; it only works on a single Node instance."

**Q13: How does the Root Cause Analysis (RCA) feature maintain data privacy?**
A: "In `apps/daemon/src/index.ts`, I integrated the analysis engine with local Ollama. The reason was that sending enterprise failure logs to OpenAI violates strict data privacy rules. Looking at the code, you can see it fetches from `http://localhost:11434/api/generate` to process the error. The trade-off I accepted was relying on the user having sufficient local compute to run a 3B-7B parameter model effectively."

**Q14: What happens to the dashboard state if a user refreshes the page mid-execution?**
A: "In `apps/daemon/src/index.ts:wsServer.on("connection")`, I implemented a bootstrap payload. The reason was to hydrate the UI immediately upon connection without requiring a manual REST fetch. Looking at the code, you can see it sends a `bootstrap` message containing `getRecentEvents(200)`. The trade-off I accepted is that setting a hard limit of 200 events might miss older context for long-running traces."

**Q15: How did you structure the OpenTelemetry integration to be non-intrusive?**
A: "In `otel.py:AgentGlassSpanProcessor`, I subclassed `SpanProcessor`. The reason was to allow enterprises to plug AgentGlass into their existing OTel pipelines without rewriting agent logic. Looking at the code, you can see I heuristically map `SpanKind.CLIENT` to `llm_request` events. The trade-off I accepted was a loss of strict schema enforcement, as I just dump the OTel attributes into the payload dictionary."

**Q16: How do you handle schema upgrades in the event database?**
A: "In `schema.ts`, I defined a strict `SCHEMA_VERSION` constant. The reason was to ensure future backwards compatibility. Looking at the code, you can see it defaults to `0.1.0` and is injected into every `AgentGlassEvent`. The trade-off I accepted is that currently, the daemon doesn't actively reject older versions, but the foundation is there for migration scripts."

**Q17: Why did you build a custom DAG visualizer instead of using standard charts?**
A: "In `apps/dashboard/app/page.tsx`, I utilized `@xyflow/react` (React Flow) combined with `dagre`. The reason was that multi-agent systems use complex branching and looping paths (LangGraph) that standard timeline charts cannot represent. Looking at the code, `deriveEdgesFromEvents()` reconstructs parent-child spans to feed into the autolayout engine. The trade-off I accepted was heavy DOM rendering overhead for graphs with 100+ nodes."

**Q18: Is your VCR LLM Cache thread-safe?**
A: "In `vcr.py:VCRCache`, I used SQLite with `check_same_thread=False`. The reason was that modern ASGI servers or LangChain asynchronous wrappers execute LLM calls concurrently across threads. Looking at the code, you can see I use `with self.conn:` context managers to wrap transactions. The trade-off I accepted was potential SQLite database lock contention under extremely heavy concurrent LLM traffic."

**Q19: How do you identify which specific execution branch crashed in a multi-agent system?**
A: "In `client.py:AgentGlassEvent`, I implemented a strict parent-child tracing model using `parent_span_id`. The reason was that concurrent agents executing in parallel obscure causality. Looking at the code, the dashboard visualizer recursively climbs the `parent_span_id` tree to highlight the exact path that led to the `error` event. The trade-off I accepted was the complexity of managing nested IDs in Python."

**Q20: What happens if the payload data contains cyclical references?**
A: "In `langgraph_adapter.py:_safe_serialize`, I wrote a custom serialization safety net. The reason was that LangChain often injects complex runtime objects (like memory stores or classes) into the state which throw `TypeError` during `json.dumps`. Looking at the code, you can see it catches `TypeError` and falls back to `str(obj)`. The trade-off I accepted is a loss of structured querying for complex nested objects in the dashboard."
