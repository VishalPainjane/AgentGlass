# Dashboard Workflow Redesign and Docs Completion Plan

Status: Draft - Ready to execute
Objective: Re-imagine broken dashboard workflows and deliver complete, working documentation.

Scope:
- Dashboard routes: /, /live, /compare, /cache, /settings, /docs
- Data sources: daemon API, websocket events, trace store
- Python SDK examples used in docs

Out of scope (for this plan): marketing landing page redesign, pricing, auth.

Success criteria:
- A new user can run Quickstart and see a trace in the dashboard in under 10 minutes.
- Compare trace uses real data and communicates meaningful differences.
- Cache manager shows real cache items or a clear empty state with next steps.
- Settings page contains functional, persisted preferences.
- Docs contain working examples and troubleshooting steps that actually fix issues.

---

Phase 0: Discovery and Data Contracts
- [ ] Inventory current data sources and identify hardcoded or mocked UI data.
- [ ] Define a trace comparison model (primary trace, compare trace, diff schema).
- [ ] Define cache entity fields (key, provider, createdAt, size, tags, status).
- [ ] Define settings schema (connection, retention, theme, shortcuts, exports).
- [ ] Confirm API endpoints and event payloads needed for compare/cache/settings.

Phase 1: Top Bar and Global Shell
- [ ] Layout spec: left (app name), center (trace selector), right (actions).
- [ ] Trace selector: searchable, keyboard navigable, stable width, long-name truncation.
- [ ] Remove connection status from top bar; move to Settings or status panel.
- [ ] Actions: ensure consistent placement and no overlap on resize.
- [ ] Empty states: no traces, disconnected daemon, loading spinner.
- [ ] Acceptance tests: resize, long names, 100+ traces, keyboard only.

Phase 2: Compare Trace v2 (Re-imagined)
- [ ] UX flow: pick primary trace, then select a compare trace.
- [ ] View modes: side-by-side summary + node diff list.
- [ ] Summary metrics: events, nodes, duration, tokens, errors.
- [ ] Diff model: node added/removed, duration delta, output delta.
- [ ] Output diff: JSON diff with highlighting and key-level filters.
- [ ] Clear CTAs and empty states when only one trace is selected.
- [ ] Remove hardcoded data and bind to real trace APIs.
- [ ] Acceptance tests: compare success, missing data, large traces.

Phase 3: Cache Manager v1
- [ ] If cache is not configured, show a clear empty state with CLI guidance.
- [ ] List view: key, model/provider, created, size, status.
- [ ] Filters: provider, status, time range, search by key.
- [ ] Detail panel: inputs, outputs, metadata, replay hint.
- [ ] Actions: invalidate single cache, clear all, confirm dialog.
- [ ] Acceptance tests: empty state, populated state, delete flow.

Phase 4: Settings v1
- [ ] Sections: Connection, Storage and Retention, UI Preferences, Export.
- [ ] Connection: host/port, status, reconnect.
- [ ] Storage: retention window, cache directory, clear buttons.
- [ ] Preferences: theme, density, keyboard shortcuts (if enabled).
- [ ] Export: trace export options and default format.
- [ ] Acceptance tests: values persist, validation errors are clear.

Phase 5: Docs v1 (Open-source grade)
- [ ] Quickstart: install, run daemon, run demo, verify in dashboard.
- [ ] Architecture overview: event model, storage, and data flow.
- [ ] SDK guide: Python integration with working examples.
- [ ] Dashboard guide: live view, compare, cache, settings, export.
- [ ] Troubleshooting: offline daemon, missing traces, port conflicts.
- [ ] Sample outputs and screenshots that match the current build.

Phase 6: Reference Agent Systems (4-5 complex builds)
- [ ] Define 4-5 "golden" agent systems used for docs, testing, and demos.
- [ ] Primary frameworks: LangGraph and LangChain.
- [ ] Additional frameworks to mention for later: LlamaIndex, AutoGen, CrewAI.
- [ ] Each system must include these code components (across the set):
	- LLM calls (streaming and non-streaming).
	- Tool calls (HTTP APIs, file I/O, database access).
	- Orchestration and routing (branching, retries, fallbacks).
	- Persistence (SQLite, Redis, or file-based memory).
	- Trace and span metadata (trace IDs, node IDs, timing).
	- Agent state updates and checkpoints.
	- Prompt templates and prompt versioning.
	- Error paths (timeouts, tool failures, malformed output).
	- Exportable artifacts (trace export, logs, and summaries).
	- MCP tool usage (at least one system uses an MCP tool server).

- [ ] System A: LangGraph multi-agent research pipeline
	- Orchestrator with sub-agents, tool calls, and RAG retrieval.
	- State checkpoints, branching logic, and error recovery.

- [ ] System B: LangChain tool-router service
	- HTTP API entry point, streaming responses, tool calling.
	- Memory store, retries, and persisted session state.

- [ ] System C: Notebook exploration workflow
	- Manual span creation, step-by-step tracing, injection pause.
	- Quick compare between two runs.

- [ ] System D: Long-running task service
	- Background queue, async workers, persistence, and retries.
	- Idempotent runs and trace recovery on restart.

- [ ] System E: MCP-driven agent
	- Uses an MCP tool server for external tools and data access.
	- Validates MCP call tracing and tool result rendering.

Phase 7: QA and Regression
- [ ] E2E checklists for top bar, compare, cache, settings, docs.
- [ ] Visual regression checks for top bar and compare layout.
- [ ] Performance checks on large traces (1000+ events).
- [ ] Accessibility checks for keyboard navigation and focus order.

---

Open questions
- Should compare support more than two traces (baseline vs multiple variants)?
- Do we want cache management exposed if VCR is disabled?
- Which settings are required for v1 vs future roadmap?
