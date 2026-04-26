# AgentGlass — V2 Feature Roadmap & Execution Plan

> **Context:** Steps 1–4 from the original Priority and Execution Plan are **complete** (GA Gate reached). This document extends the roadmap with six transformative features that turn AgentGlass from a debugger into a **live command center for autonomous AI systems**.

---

## Feature Inventory

| # | Feature | Codename | Priority | Effort | User Value |
|---|---------|----------|----------|--------|------------|
| 1 | Execution Forking | **GitFork** | P0 | Large | ✅ Done |
| 2 | LLM Response Cache | **VCR** | P0 | Medium | ✅ Done |
| 3 | Local Root-Cause Analysis | **AutoRCA** | P1 | Large | Intelligent, privacy-preserving error diagnosis |
| 4 | RAG X-Ray Panel | **XRay** | P1 | Medium | Bridges vector-search opacity for RAG builders |
| 5 | Terminal UI | **TUI** | P2 | Medium | Captures keyboard-centric power users |
| 6 | God Mode Live Injection | **GodMode** | P2 | Medium | Turns debugger into live mission control |

---

## Priority Rationale

### P0 — Ship Immediately (Weeks 1–6)

**GitFork** and **VCR** are P0 because they solve the two biggest pain points developers hit *every single debug session*:

- **GitFork** removes the need to re-run the entire pipeline to test "what if" scenarios. A developer debugging a 12-agent pipeline currently restarts from scratch to test one changed prompt. With forking, they branch at the failing node and test 5 variations in parallel. This is the single most differentiating feature in the observability space.
- **VCR** directly saves money. Every debug iteration currently burns real tokens. A prompt-hash cache makes replay free. This is the feature developers will *tell their friends about* because the ROI is immediately measurable in their billing dashboard.

### P1 — Ship Next (Weeks 7–12)

**AutoRCA** and **XRay** are P1 because they require the P0 features to be stable (AutoRCA benefits from cached responses to re-analyze failures; XRay benefits from forking to compare retrieval across branches):

- **AutoRCA** turns AgentGlass from a passive viewer into an active collaborator. When an agent crashes, a local Ollama model inspects the error and suggests fixes. This is the "wow" moment in demos.
- **XRay** targets the fastest-growing segment: RAG pipeline builders. Showing vector distances and chunk boundaries inline is something no existing tool does well.

### P2 — Ship After (Weeks 13–16)

**TUI** and **GodMode** are P2 because they expand the user base rather than deepen core value:

- **TUI** captures the Arch/Neovim power-user demographic who drive open-source adoption.
- **GodMode** extends the existing state injection into a real-time REPL for live systems.

---

## Step 5 — Execution Forking ("Git for Agent State")

### Objective
Let developers branch execution at any node, modify state on each branch, and run them forward in parallel to compare outcomes.

### How a Developer Uses It
```
1. Run a multi-agent pipeline (e.g., customer support bot)
2. The Analyzer agent makes a bad decision at node X
3. In the dashboard, right-click node X → "Fork Execution"
4. Two branches appear:
   - Branch A: Edit the LLM prompt temperature to 0.0
   - Branch B: Edit the retrieved context to remove a poisoned chunk
5. Click "Run Both" — both branches execute forward independently
6. A side-by-side diff panel shows which branch produced the correct answer
7. The developer now knows the root cause (bad retrieval, not bad LLM)
   without writing a single unit test
```

### Scope
1. New `fork_id` field on events to tag branched traces
2. Fork metadata table in SQLite: `forks(fork_id, parent_trace_id, branch_label, forked_at_span_id, forked_at_timestamp)`
3. Dashboard "Fork" context menu on graph nodes
4. Branch selector dropdown in the top bar alongside trace selector
5. Side-by-side diff panel comparing branch outputs at the terminal node
6. Python SDK `client.fork_trace(trace_id, span_id)` → returns new `(trace_id, fork_id)`

### Architecture
- A fork creates a **new trace_id** linked to the original via `fork_id`
- Events before the fork point are shallow-copied (referenced, not duplicated)
- Events after the fork point are independent
- The dashboard renders branch tabs and overlays divergence points on the graph

### Exit Criteria
1. User can fork at any completed node and see two independent branches
2. Side-by-side comparison of terminal outputs is functional
3. Fork metadata is persisted and survives daemon restart

---

## Step 6 — VCR LLM Cache ("Zero-Cost Debugging")

### Objective
Intercept LLM API calls and cache prompt→response pairs locally so that repeated debug runs cost $0.00.

### How a Developer Uses It
```
1. Run a 20-step multi-agent pipeline (first run: real API calls, costs $0.47)
2. Find a bug in step 14
3. Fix the bug in their Python code
4. Re-run the pipeline
5. Steps 1–13 execute instantly from cache (0 API calls, $0.00)
6. Step 14 onwards uses real API calls (since the prompt changed)
7. Total cost of second run: $0.03 instead of $0.47
8. After 50 debug iterations, developer saved ~$22
```

### Scope
1. New SQLite table: `llm_cache(prompt_hash TEXT PRIMARY KEY, model TEXT, response TEXT, tokens_in INT, tokens_out INT, created_at INT)`
2. Python SDK interceptor: `@agentglass_vcr` decorator or `VCRInterceptor` class that wraps `openai.ChatCompletion.create`, `anthropic.messages.create`, and `google.generativeai.generate_content`
3. Hash function: SHA-256 of `model + sorted(messages JSON)` for deterministic cache keys
4. Cache modes: `record` (always call API, save response), `playback` (always use cache), `auto` (use cache if hit, else call API and save)
5. Dashboard indicator: cache hit/miss badge on LLM nodes (green = cached, orange = live)
6. CLI flag: `agentglass up --vcr=auto` to set the mode globally
7. Cache invalidation: `agentglass cache clear` CLI command, or TTL-based expiry

### Architecture
- The interceptor lives in the Python SDK, NOT in the daemon
- Cache writes go to a local SQLite file (separate from traces.db to keep concerns clean)
- The daemon receives a `cache_hit: true` flag in the event payload so the dashboard can show it
- No network interception or monkey-patching — the decorator wraps the call explicitly

### Exit Criteria
1. Second run of identical pipeline uses 0 API calls for unchanged prompts
2. Changed prompts correctly bypass cache and call the real API
3. Dashboard shows cache hit/miss indicators on LLM nodes
4. `agentglass cache clear` wipes all cached responses

---

## Step 7 — Local Root-Cause Analysis ("AutoRCA")

### Objective
When an agent fails, automatically use a local LLM (via Ollama) to analyze the error, diff expected vs. actual schemas, and suggest a fix — all without sending data off-machine.

### How a Developer Uses It
```
1. A multi-agent pipeline crashes: the Writer agent received a malformed
   JSON payload from the Analyzer because the LLM hallucinated an extra
   field that breaks Pydantic validation
2. The ERROR node turns red in the graph
3. Developer clicks on it — the inspector opens
4. A new "RCA" tab appears alongside Input/Output/Events
5. The RCA tab shows:
   - "Root Cause: Field 'confidence_score' expected float, got string '99%'"
   - "Upstream Origin: Analyzer node, llm_response event at 22:15:11.677"
   - "Suggested Fix: Add a pre-validation step or use `confidence: float = Field(ge=0, le=1)`"
6. The developer clicks "Jump to Origin" → graph scrolls to the Analyzer
   node and highlights the exact event
```

### Scope
1. Daemon-side Ollama integration: `POST http://localhost:11434/api/generate` with a structured analysis prompt
2. New daemon endpoint: `POST /v1/rca` — accepts `{trace_id, span_id}`, returns `{root_cause, origin_span_id, suggestion}`
3. Analysis prompt template that includes: the error event payload, the preceding 5 events in the trace, and the Pydantic schema if available
4. Dashboard "RCA" tab in NodeInspector for error nodes
5. "Jump to Origin" button that navigates to the upstream causal node
6. Configurable model: `AGENTGLASS_RCA_MODEL=llama3.2:3b` env var

### Architecture
- RCA runs on-demand (not automatically) to avoid wasting compute
- Results are cached in SQLite: `rca_results(trace_id, span_id, analysis TEXT, created_at INT)`
- The daemon proxies the Ollama request; the dashboard never talks to Ollama directly
- If Ollama is not running, the RCA tab shows "Install Ollama to enable local analysis"

### Exit Criteria
1. Clicking "Analyze" on an error node produces a meaningful root-cause analysis
2. Analysis runs entirely locally (no data leaves the machine)
3. "Jump to Origin" navigates to the correct upstream node
4. Feature degrades gracefully when Ollama is not installed

---

## Step 8 — RAG X-Ray Panel

### Objective
When a retriever tool executes, render a specialized panel showing vector distances, chunk boundaries, metadata, and a visual "why was this chunk selected?" explanation.

### How a Developer Uses It
```
1. A RAG pipeline retrieves 5 document chunks for a user query
2. The agent produces a wrong answer
3. Developer clicks on the retriever tool_result node
4. Instead of raw JSON, a visual "X-Ray" panel appears:
   - Each retrieved chunk shown as a card with:
     - Document title + source URL
     - Cosine similarity score (e.g., 0.89, 0.76, 0.71...)
     - Character/token boundaries within the source document
     - A relevance bar (green = high, red = low)
   - A "Query vs. Chunk" heatmap showing token-level attention overlap
5. Developer immediately spots that Chunk #3 (score 0.71) is from a
   completely unrelated document — the retriever's similarity threshold
   is too low
```

### Scope
1. New event payload convention: retriever tools emit `payload.retrieval_results[]` with `{text, score, source, metadata}`
2. Dashboard component: `RAGXRayPanel.tsx` — renders when event payload contains `retrieval_results`
3. Visual elements: score bars, chunk cards, expandable full-text view, sorting by score
4. Python SDK helper: `agentglass.rag.log_retrieval(query, results)` convenience method
5. Optional: token-level overlap visualization if both query and chunk embeddings are provided

### Architecture
- No daemon changes needed — this is purely a dashboard rendering concern
- The SDK helper just formats the payload correctly; no magic
- The panel replaces the Monaco Editor for retriever events (or appears as a new tab)

### Exit Criteria
1. Retriever tool results render as visual cards with scores
2. Chunks are sortable by relevance score
3. Developer can immediately identify low-quality retrievals visually

---

## Step 9 — Terminal UI ("TUI")

### Objective
Ship a keyboard-driven terminal interface that renders the agent graph, event timeline, and inspector using ANSI/Unicode characters — perfect for developers who live in tmux + Neovim.

### How a Developer Uses It
```
1. Developer is in their terminal, running agents
2. Instead of opening a browser: `agentglass tui`
3. A full-screen TUI appears:
   - Left pane: ASCII-rendered DAG (nodes as boxes, edges as lines)
   - Right pane: Event list with color-coded badges
   - Bottom pane: JSON payload viewer (syntax highlighted)
4. Navigate with arrow keys, select nodes with Enter
5. Press 'f' to fork, 'i' to inject state, 'r' to request RCA
6. Press 'q' to quit — back to their shell instantly
```

### Scope
1. Python package: `agentglass-tui` using the `textual` framework
2. WebSocket client connecting to `ws://127.0.0.1:7777/ws` for live events
3. Panels: graph view (ASCII DAG), event timeline, payload inspector
4. Keybindings: `j/k` scroll, `Enter` select, `Tab` switch panes, `q` quit, `f` fork, `i` inject
5. Color theme matching the web dashboard's glassmorphism palette (cyan/green/amber on dark)

### Architecture
- The TUI is a standalone Python app that consumes the same WebSocket stream as the web dashboard
- No daemon changes needed
- Ships as `pip install agentglass-python[tui]` (adds `textual` dependency)
- Reuses the same REST endpoints for trace listing and event querying

### Exit Criteria
1. `agentglass tui` renders a live-updating agent graph in the terminal
2. Node selection shows payload in the inspector pane
3. All keybindings function as documented
4. Works on Windows Terminal, iTerm2, and standard Linux terminals

---

## Step 10 — God Mode Live Injection

### Objective
Extend the existing state injection system into a real-time command REPL that lets developers inject state, trigger tool calls, and override LLM responses *while the multi-agent system is running live*.

### How a Developer Uses It
```
1. A live multi-agent system is processing 50 requests/second
2. Developer notices the Router agent is misclassifying 20% of requests
3. Opens the God Mode console (bottom drawer in dashboard, or `agentglass god` CLI)
4. Types: `inject IntentRouter.classification_threshold = 0.85`
5. The change takes effect immediately on the next Router invocation
6. Types: `force-tool RefundAgent.stripe_refund --dry-run`
7. The tool executes in sandbox mode, showing what would happen
8. Types: `override Summarizer.llm_response "Use a more formal tone"`
9. The next Summarizer call uses the overridden instruction
10. All injections are logged to the audit trail for post-mortem review
```

### Scope
1. Dashboard "God Mode" drawer with command input and output log
2. Command parser supporting: `inject <node>.<field> = <value>`, `force-tool <node>.<tool> [--dry-run]`, `override <node>.<event_type> <value>`
3. Daemon endpoint: `POST /v1/commands` — accepts structured commands and queues them
4. Python SDK: `client.poll_commands(trace_id, span_id)` — agents check for pending commands before each step
5. Audit log: all commands logged as `god_mode_command` events in the trace
6. Safety: `--dry-run` flag for destructive commands; confirmation prompt for `force-tool`

### Architecture
- Commands are stored in a new `commands` table: `commands(id, trace_id, target_span, command_type, payload, status, created_at)`
- The Python SDK polls for pending commands at configurable intervals
- Commands have statuses: `pending` → `acknowledged` → `executed` / `rejected`
- The God Mode drawer shows command history with execution status

### Exit Criteria
1. Developer can inject a value into a running agent from the dashboard
2. Injected commands appear in the trace audit log
3. Dry-run mode shows predicted effects without executing
4. Command history is persisted and reviewable

---

## V2 Milestone Timeline

| Week | Phase | Features | Exit Gate |
|------|-------|----------|-----------|
| 1–3 | **5A** | GitFork: schema + daemon + SDK | Fork creates valid branched trace |
| 4–6 | **5B + 6** | GitFork: dashboard UI + VCR cache | Side-by-side diff works; cache saves >90% API calls on re-run |
| 7–9 | **7** | AutoRCA: Ollama integration + RCA tab | Error nodes show analysis with jump-to-origin |
| 10–12 | **8** | RAG X-Ray panel | Retriever results render as visual cards |
| 13–14 | **9** | TUI: Textual-based terminal interface | `agentglass tui` renders live graph |
| 15–16 | **10** | God Mode: live command injection | Real-time inject from dashboard REPL |

---

## V2 Engineering KPIs

| Metric | Target |
|--------|--------|
| Fork branch creation latency | < 200ms |
| VCR cache hit rate on unchanged prompts | 100% |
| AutoRCA analysis time (3B model) | < 5 seconds |
| RAG X-Ray render time (20 chunks) | < 100ms |
| TUI startup time | < 1 second |
| God Mode command acknowledgment latency | < 500ms |

---

## V2 Release Gates

### V2-Alpha
1. Execution forking creates valid branched traces
2. VCR cache intercepts at least OpenAI and Anthropic calls
3. Basic RCA analysis produces meaningful output on test errors

### V2-Beta
1. Side-by-side branch diff panel functional
2. RAG X-Ray panel renders retriever results visually
3. TUI renders live-updating graph with keybindings

### V2-GA
1. God Mode live injection round-trips in < 500ms
2. All 6 features documented with examples
3. E2E test suite covers forking, caching, RCA, RAG, TUI, and God Mode
