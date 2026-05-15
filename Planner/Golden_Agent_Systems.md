# Golden Agent Systems

Status: Draft
Objective: Define the 4-5 canonical reference agent systems that will be used for end-to-end testing, documentation examples, and benchmarking AgentGlass. These systems must cover the entire feature matrix of the observability platform.

## Design Philosophy
These are not toy examples (like a single "hello world" prompt). They are intentionally designed to stress-test specific complexities of agentic architecture: loops, errors, human intervention, massive payloads, and concurrent execution.

---

## 1. The ReAct Loop (LangGraph)
**Primary Focus:** Tool execution, loops, and routing logic.

*   **Framework:** LangGraph
*   **Architecture:** A standard `StateGraph` implementing the ReAct (Reason + Act) pattern. It receives a complex question, routes to a tool node (e.g., a mock WebSearch or Calculator), processes the result, and loops back to the LLM.
*   **AgentGlass Features Tested:**
    *   `instrument_langgraph` adapter functionality.
    *   Graph topology visualization (cycles/loops).
    *   `tool_call` and `tool_result` event correlation.
    *   Compare Mode (testing a good prompt vs. a prompt that gets stuck in an infinite loop).

## 2. Human-in-the-Loop Orchestrator (LangGraph)
**Primary Focus:** State injection, persistence, and God Mode.

*   **Framework:** LangGraph
*   **Architecture:** An agent that drafts an email but requires explicit human approval before sending. Execution pauses, waiting for external state modification.
*   **AgentGlass Features Tested:**
    *   God Mode: Injecting modified state via the dashboard to resume the agent.
    *   Timeline Scrubber: Verifying state diffs before and after the injection.
    *   Long-running trace stability (handling traces that span minutes/hours).

## 3. Strict Data Extractor (LangChain)
**Primary Focus:** Structured output, error handling, and VCR caching.

*   **Framework:** LangChain (LCEL)
*   **Architecture:** A linear pipeline that parses unstructured text into a strict JSON schema (e.g., extracting invoice data). It includes explicit retry logic (parsing failures).
*   **AgentGlass Features Tested:**
    *   Error event capture and Root Cause Analysis (RCA) via Ollama.
    *   VCR Cache: Replaying the exact same extraction cost-free during debug iterations.
    *   Payload blobbing (handling large input text blocks >10KB).

## 4. Multi-Agent Swarm (Native SDK)
**Primary Focus:** Complex hierarchy, `parent_span_id` threading, and custom runtimes.

*   **Framework:** Pure Python / Native AgentGlass SDK
*   **Architecture:** A "Planner" agent that decomposes a task and spawns multiple asynchronous "Worker" agents to execute sub-tasks concurrently.
*   **AgentGlass Features Tested:**
    *   The `@with_agentglass` decorator and native `client.track_event`.
    *   Asynchronous event ingestion and strict timestamp ordering.
    *   Deeply nested span hierarchies and complex tree layouts in the Live Graph.

## 5. The RAG Pipeline (OpenTelemetry / LlamaIndex)
**Primary Focus:** External infrastructure bridging and Model Context Protocol (MCP).

*   **Framework:** FastAPI + OpenTelemetry (Future: LlamaIndex native)
*   **Architecture:** A web endpoint that receives a query, fetches context from a Vector DB, and generates an answer. 
*   **AgentGlass Features Tested:**
    *   `AgentGlassSpanProcessor` for OpenTelemetry integration.
    *   RAG X-Ray: Inspecting vector distance scores and retrieved chunks.
    *   Handling traces that bridge standard web server spans and AI spans.

---

## Future Expansions
As the platform matures, we will add reference implementations for:
*   **CrewAI / AutoGen:** To test specialized multi-agent communication protocols.
*   **MCP (Model Context Protocol):** To test standardized tool integrations across different model providers.
