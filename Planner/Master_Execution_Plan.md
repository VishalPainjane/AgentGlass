# Master Execution Plan (Single Source of Truth)

Status: Draft
Objective: Provide one unified flow forward that reconciles all existing planner documents and drives execution from broken workflows to stable release.

---

## Inputs (source plans)

- [Planner/Feature_Audit_and_Fix_Plan.md](Planner/Feature_Audit_and_Fix_Plan.md)
- [Planner/Workflow_Redesign_and_Docs_Plan.md](Planner/Workflow_Redesign_and_Docs_Plan.md)
- [Planner/Website_UI_UX_Improvement_Plan.md](Planner/Website_UI_UX_Improvement_Plan.md)
- [Planner/Priority_and_Execution_Plan.md](Planner/Priority_and_Execution_Plan.md)
- [Planner/V2_Feature_Roadmap.md](Planner/V2_Feature_Roadmap.md)
- [Planner/System_Design.md](Planner/System_Design.md)
- [Planner/Arch_and_Package.md](Planner/Arch_and_Package.md)
- [Planner/Frameworks.md](Planner/Frameworks.md)
- [Planner/More_Features.md](Planner/More_Features.md)
- [Planner/User_Perspective_Product_Guide.md](Planner/User_Perspective_Product_Guide.md)
- [Planner/Description.md](Planner/Description.md)

---

## Guiding principles

- Fix broken workflows before adding polish or new features.
- Keep everything local-first and deterministic.
- Prefer real data paths over mock or hardcoded UI states.
- Docs must match the actual product behavior.
- Each phase must have a clear exit gate.

---

## Current reality (known blockers)

- Top bar and trace selector are unclear and unstable.
- Connection status flickers and should not be in the top bar.
- Compare trace view uses hardcoded data and does not work end-to-end.
- Cache manager is empty or disconnected from real data.
- Settings page is empty and provides no real controls.
- Documentation is incomplete and lacks working examples.

---
    
## Execution flow (phased)

### Phase 0: Reality sync and contract freeze

- [x] Align feature status with the actual UI and data path.
- [x] Freeze data contracts for compare, cache, settings, and trace metadata.
- [x] Define the minimum API surface required for compare and cache.
- [ ] Update any doc claims that do not match current behavior.

Exit gate:
- Data contracts defined and approved.
- Every broken workflow has a named owner and a target fix.

---

### Phase 1: Core workflow fixes (P0)

- [x] Top bar redesign and trace selector UX (clear layout, no overlap, keyboard support).
- [x] Remove connection status from top bar; relocate to Settings or status panel.
- [x] Compare trace v2: real selection flow and no hardcoded data.
- [x] Cache manager v1: real data list or clear empty state with CLI guidance.
- [x] Settings v1: connection, storage, retention, theme, export, shortcuts.
- [ ] Docs v1: quickstart, SDK integration, dashboard guide, troubleshooting.

Exit gate:
- Each workflow is functional with real data.
- No hardcoded placeholders in compare or cache.
- Settings has working controls and persistence.

---

### Phase 2: Backend and data path hardening

- [ ] Validate daemon endpoints for compare, cache, settings, and export.
- [ ] Ensure websocket updates do not flicker or double-render.
- [ ] Enforce idempotency and stable event ordering in the UI timeline.
- [ ] Add empty-state handling for missing traces, cache, or offline daemon.

Exit gate:
- Live data remains stable under reconnects and large traces.
- Compare, cache, and settings endpoints return consistent data.

---

### Phase 3: Feature audit and end-to-end testing

- [x] Run the full audit matrix from the feature audit plan.
- [x] Validate SDK instrumentation (LangGraph, OTel, VCR).
- [x] Verify graph layout, timeline scrubber, and inspector correctness.
- [x] Test the broken features after fixes (compare, cache, settings).

Exit gate:
- All critical tests pass and are logged in the audit plan.
- No regressions in live graph and timeline playback.

---

### Phase 4: Reference agent systems (4-5 complex builds)

- [x] Define the 4-5 "golden" systems used in docs and testing.
- [x] Prioritize LangGraph and LangChain; mention LlamaIndex, AutoGen, CrewAI for later.
- [x] Ensure the set covers LLM calls, tools, persistence, routing, errors, MCP, and state injection.

Exit gate:
- Each system has a clear spec and is ready to be implemented.
- These systems can be used as E2E fixtures.

---

### Phase 5: Documentation overhaul (open-source grade)

- [ ] Rebuild docs around the real workflows and reference systems.
- [ ] Add working examples and full steps (install, run, verify, debug).
- [ ] Add troubleshooting and known limitations.
- [ ] Align the docs with the user perspective guide.

Exit gate:
- A new user can follow the docs to a working trace in under 10 minutes.

---

### Phase 6: UI/UX polish and onboarding

- [ ] Apply the UI/UX improvement plan only after core flows are stable.
- [ ] Add premium components, micro-interactions, and empty states.
- [ ] Ensure performance, accessibility, and cross-device stability.

Exit gate:
- No visual regressions, and UX feels clean and intentional.

---

### Phase 7: V2 feature execution (post-stability)

- [ ] Sequence V2 features per the V2 roadmap.
- [ ] Ensure each V2 feature ships with docs and E2E coverage.

Exit gate:
- V2 features meet their exit criteria and are demo-ready.

---

## Milestone gates (summary)

- Gate A: Contracts frozen and blockers assigned.
- Gate B: Core workflows fixed and using real data.
- Gate C: Audit matrix passed and no regressions.
- Gate D: Reference agent systems defined and ready.
- Gate E: Docs are complete and verifiable.
- Gate F: UI/UX polish complete without functional regressions.
- Gate G: V2 roadmap execution begins.

---

## Immediate next actions

- [x] Approve this master plan as the execution baseline.
- [x] Pick the first P0 workflow to fix (top bar, compare, cache, settings).
- [x] Freeze data contracts for compare, cache, and settings.
