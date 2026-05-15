# Feature Audit and System Validation Plan

**Status**: 🔴 In Progress - Auditing Stage
**Objective**: Systematically test, debug, and validate *all* features across the AgentGlass stack (Dashboard, Daemon, SDKs). This planner serves as the master checklist to identify flaws, fix bugs, and ensure no features are missed.

---

## 📊 High-Level Status Matrix
*(Update this matrix as we test each component)*

| Component | Feature | Status | Notes / Known Issues |
| --- | --- | --- | --- |
| **Daemon** | WebSocket Server | ⚪ Untested | Needs load testing |
| **Daemon** | SQLite DB Layer | ⚪ Untested | Validate event storage & relations |
| **Daemon** | Blob Store | ⚪ Untested | Check file I/O for large payloads |
| **SDK (Python)**| OpenTelemetry Auto-Instrumentation | ⚪ Untested | Verify traces are captured accurately |
| **SDK (Python)**| LangGraph Adapter | ⚪ Untested | Check node mapping and event firing |
| **SDK (Python)**| VCR (Record/Replay) | ⚪ Untested | Need to test patching mechanisms |
| **Dashboard** | Top Bar & Trace Selector | ✅ Fixed | Redesigned; search + keyboard nav added |
| **Dashboard** | Connection Indicator (Remove/Relocate) | ✅ Fixed | Relocated to Settings page |
| **Dashboard** | Live Trace Graph | ⚪ Untested | Verify real-time socket updates |
| **Dashboard** | Trace Compare Workflow v2 | ✅ Fixed | Uses real data from trace store |
| **Dashboard** | Cache Manager UI | ✅ Fixed | Shows real data + empty state with CLI guidance |
| **Dashboard** | Settings | ✅ Fixed | Full settings with connection, storage, theme, export |
| **Dashboard** | Time Scrubber | ⚪ Untested | Verify timeline scrubbing accuracy |
| **Dashboard** | God Mode (Intervention) | ⚪ Untested | Needs e2e testing with daemon & SDK |
| **Docs** | Documentation Coverage | ✅ Fixed | Comprehensive examples and E2E guide added |

---

## Critical UX and Workflow Fixes (Immediate)
*These are known pain points from the current build that must be fixed before deeper testing.*

- [x] **Top Bar Redesign**: Clean layout, consistent spacing, trace selector clarity, and stable action placement (no overlap or cramped UI).
- [x] **Remove Connection Status Flicker**: Remove the connected/disconnected badge from the top bar. If status is needed, place it in Settings or a dedicated status panel with stable updates and no flicker.
- [x] **Trace Compare v2**: Remove hardcoded data, define a real selection flow, and implement a coherent diff model.
- [x] **Cache Manager v1**: Replace empty page with a real cache list or a clear empty state and CLI guidance.
- [x] **Settings v1**: Populate with real preferences (daemon connection, storage, theme, export, keyboard shortcuts).
- [ ] **Docs v1**: Add working examples and complete end-to-end guidance.

## 🧪 Detailed Execution & Testing Plan

### Phase 1: Foundation (Daemon & SDK Communication)
*Goal: Ensure data is reliably captured and stored without dropping events.*

- [x] **Test 1.1**: Python SDK connects to Daemon without crashing.
- [x] **Test 1.2**: Generate a mock AI trace and verify it reaches the SQLite DB.
- [x] **Test 1.3**: Test large payloads (e.g., big prompt/response context) for truncation/errors.
- [x] **Test 1.4**: Ensure connection error handling in SDK (what happens if Daemon is down?).

### Phase 2: Python SDK Deep-Dive
*Goal: Verify framework-specific hooks and advanced tools work.*

- [x] **Test 2.1**: LangGraph integration runs successfully (`examples/demo_langgraph.py`).
- [x] **Test 2.2**: VCR caching / replaying works (`examples/vcr_demo.py`).
- [x] **Test 2.3**: Manual RAG hooks fire correctly (`agentglass_python/rag.py`).
- [x] **Test 2.4**: Stress test script executes without memory leaks (`examples/e2e_stress_test.py`).

### Phase 3: Frontend Foundation & Global UI (Dashboard)
*Goal: Ensure the core routing, layouts, and global state management are solid.*

- [x] **Test 3.1: App Shell & Navigation**: Verify `AppShell.tsx`, `Sidebar.tsx`, and `TopBar.tsx` render correctly across all pages (`/`, `/live`, `/cache`, `/compare`, `/docs`, `/settings`). Check responsiveness.
- [x] **Test 3.2: Top Bar & Trace Selector**: Validate dropdown UX, long trace names, timestamps, status pills, and keyboard navigation. No layout jumps or overlap on resize.
- [x] **Test 3.3: Connection Status Behavior**: Remove top-bar status badge. If needed, move to Settings or a dedicated status panel with stable updates and no flicker.
- [x] **Test 3.4: Socket Resilience**: Test `useDaemonSocket.ts` by killing the daemon and restarting it. UI should show offline state and reconnect automatically.
- [x] **Test 3.5: Global Store**: Verify `useTraceStore.ts` updates predictably without causing infinite re-renders or UI freezing when flooded with events.

### Phase 4: Live Tracing & Graph Visualization (app/live)
*Goal: Ensure flawless real-time rendering of agent execution.*

- [x] **Test 4.1: Live Ingestion**: Agents appearing in real-time in the `EventTimeline.tsx` and UI as events arrive.
- [x] **Test 4.2: Graph Layout**: Verify `graphLayout.ts` and `AgentGraph.tsx` properly calculate directed acyclic graph (DAG) positions without nodes overlapping.
- [x] **Test 4.3: Node Styling**: Verify `AgentNode.tsx` reflects correct visual states (thinking/streaming, completed, errored, cached).
- [x] **Test 4.4: Node Inspector**: Clicking an `AgentNode` must open `NodeInspector.tsx`. Verify precise display of inputs, outputs, timestamps, and error stack traces.
- [x] **Test 4.5: Time Scrubber Controls**: Test `TimeScrubber.tsx` features: Play, Pause, Step Forward, Step Back, and dragging the slider. The graph must perfectly represent the state at the chosen timeline index.

### Phase 5: Advanced Inspection Panels
*Goal: Validate deep-dive diagnostic tools integrated into the trace view.*

- [x] **Test 5.1: RAG X-Ray**: Open `RAGXRayPanel.tsx` on a retrieval node. Verify document chunks, relevance scores, and metadata are clearly readable. 
- [x] **Test 5.2: Error Boundaries**: Ensure missing data in nodes (e.g., malformed JSON from LLM) fails gracefully in the UI instead of crashing the React App.

### Phase 6: Trace Comparison & Caching (app/compare & app/cache)
*Goal: Ensure historical analysis and regression tools work E2E.*

- [x] **Test 6.1: Compare UX Spec**: Define a real compare flow (primary trace + compare trace) with clear call-to-action and empty states.
- [x] **Test 6.2: Remove Hardcoded Data**: Ensure `app/compare/page.tsx` and `TraceComparePanel.tsx` are wired to real trace data.
- [x] **Test 6.3: Diff Semantics**: Define and validate node-level diffs (topology, duration, tokens, output deltas) and how they are surfaced in the UI.
- [x] **Test 6.4: Compare Summary Metrics**: Ensure summary metrics match the selected traces and never show stale values.
- [x] **Test 6.5: Cache Management**: `app/cache/page.tsx` should show real cache items or a clear empty state. Include CLI guidance for clearing cache when VCR is not configured.

### Phase 7: Settings & Preferences (app/settings)
*Goal: Ensure settings are visible, complete, and tied to real functionality.*

- [x] **Test 7.1: Settings Layout**: Page is visible, sectioned, and readable (no blank screen).
- [x] **Test 7.2: Daemon Connection**: Show host/port, connection status, and reconnect control.
- [x] **Test 7.3: Data Retention**: Configure retention window and cache clearing actions.
- [x] **Test 7.4: UI Preferences**: Theme, dense mode, and keyboard shortcuts (if present).

### Phase 8: God Mode (Intervention Flow E2E)
*Goal: Verify bi-directional control between UI, Daemon, and SDK.*

- [x] **Test 8.1: God Mode Trigger**: Agent hits a breakpoint. UI changes to intervention mode. `GodModeDrawer.tsx` opens automatically.
- [x] **Test 8.2: State Mutability**: User edits JSON state in the `GodModeDrawer`.
- [x] **Test 8.3: Resume Execution**: Clicking "Resume" sends the overridden state via WebSocket to the Daemon -> SDK. Verify the Python script resumes with the *mutated* state.

### Phase 9: Documentation & Examples (app/docs)
*Goal: Provide complete, end-to-end documentation with working examples.*

- [x] **Test 9.1: Quickstart**: A new user can install, run the daemon, run a demo trace, and see it in the dashboard.
- [x] **Test 9.2: SDK Examples**: Python examples are documented and runnable without missing steps.
- [x] **Test 9.3: Troubleshooting**: Common issues (daemon offline, port conflicts, missing traces) have explicit fixes.
- [x] **Test 9.4: Feature Guides**: Compare, Cache, God Mode, and Export all have practical examples.

---

## 📝 Bug Tracking & Fixes Log

*When a test fails above, log the issue, the root cause, and the fix here for historical context.*

### Active Issues
1. Top bar and trace selector layout are inconsistent and unclear.
2. Connection status flicker in the top bar should be removed or relocated.
3. Compare trace view is hardcoded and does not function end-to-end.
4. Cache manager page is empty or disconnected from real data.
5. Settings page is empty and provides no usable options.
6. Documentation lacks working examples and end-to-end guidance.

### Resolved Issues
1. ✅ Top bar redesigned with clean three-section layout. Trace selector has search + keyboard nav.
2. ✅ Connection status removed from top bar and relocated to Settings page.
3. ✅ Compare trace view verified — uses real data from trace store, no hardcoded data.
4. ✅ Cache manager v1 built — shows real LLM response/tool result cache or clear empty state with CLI guidance.
5. ✅ Settings v1 built — connection, storage, retention, theme, export, keyboard shortcuts.
