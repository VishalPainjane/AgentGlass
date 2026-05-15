/**
 * Docs v1 — Comprehensive documentation page
 *
 * Phase 1 completion:
 * - Quickstart with accurate SDK examples
 * - SDK integration patterns (native, OTel, LangGraph, VCR)
 * - Dashboard guide for all views
 * - Troubleshooting section
 * - Keyboard shortcuts
 */

import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Data                                                              */
/* ------------------------------------------------------------------ */

const tocItems = [
  { href: "#quickstart", label: "Quickstart" },
  { href: "#architecture", label: "Architecture" },
  { href: "#event-model", label: "Event Model" },
  { href: "#sdk-native", label: "SDK — Native" },
  { href: "#sdk-decorator", label: "SDK — Decorator" },
  { href: "#sdk-otel", label: "SDK — OpenTelemetry" },
  { href: "#sdk-langgraph", label: "SDK — LangGraph" },
  { href: "#sdk-vcr", label: "SDK — VCR Cache" },
  { href: "#dashboard-guide", label: "Dashboard Guide" },
  { href: "#keyboard-shortcuts", label: "Keyboard Shortcuts" },
  { href: "#troubleshooting", label: "Troubleshooting" },
  { href: "#api-reference", label: "API Reference" },
];

const architectureLayers = [
  {
    title: "Instrumentation Layer",
    details:
      "Python SDK emits normalized events for agent lifecycle, tool execution, LLM requests/responses, and state snapshots. Integration via native client, @with_agentglass decorator, OTel span processor, or LangGraph adapter.",
  },
  {
    title: "Ingest + Storage Layer",
    details:
      "A local daemon receives events over HTTP/WebSocket, deduplicates by ingest semantics, persists metadata to SQLite, and stores large payloads as blobs. Runs on http://127.0.0.1:8765 by default.",
  },
  {
    title: "Visualization Layer",
    details:
      "Next.js dashboard renders timeline + graph + inspector views from persisted events. Supports replay via timestamp slicing, trace comparison, VCR cache management, and real-time WebSocket updates.",
  },
];

const eventFields = [
  { field: "trace_id", purpose: "Groups all events for one workflow run." },
  { field: "span_id", purpose: "Identifies a single node (agent/tool) lifecycle in the graph." },
  { field: "parent_span_id", purpose: "Defines graph edge relationships for orchestration flow." },
  { field: "event_type", purpose: "Lifecycle signal: agent_start, agent_end, tool_call, tool_result, llm_request, llm_response, state_snapshot, error." },
  { field: "node_name", purpose: "Human-readable label for the span (e.g. \"Researcher\", \"web_search\")." },
  { field: "payload", purpose: "Structured contextual data for that transition (prompt, result, state)." },
  { field: "timestamp", purpose: "Microsecond precision ordering for replay and timeline slicing." },
];

const dashboardViews = [
  {
    title: "Live Graph",
    description:
      "Real-time execution graph rebuilt from agent events. Nodes appear as spans fire. Click nodes to inspect payloads in the Node Inspector panel. Use the timeline sidebar to see chronological event order.",
    path: "/live",
  },
  {
    title: "Compare Traces",
    description:
      "Side-by-side diff of two trace runs. Select a primary and compare trace from the top bar. View summary metrics (duration, nodes, errors), node-level diffs, and output payload changes.",
    path: "/compare",
  },
  {
    title: "VCR Cache Manager",
    description:
      "Inspect cached LLM responses and tool results. Search by model, provider, or node name. View payload details. Use the CLI commands (agentglass cache list/clear/stats) for batch operations.",
    path: "/cache",
  },
  {
    title: "Settings",
    description:
      "Configure daemon connection (host/port), check WebSocket status, set retention period, toggle dark/light theme, and choose export format. All settings persist in localStorage.",
    path: "/settings",
  },
];

const troubleshootingItems = [
  {
    problem: "No traces appear in the dashboard",
    solutions: [
      "Confirm the daemon is running: curl http://127.0.0.1:8765/health",
      "Verify the SDK client is pointing to the correct daemon_url",
      "Check that events are being emitted (add a print after client.track_event)",
      "Ensure the WebSocket connection shows 'Connected' in Settings → Connection",
    ],
  },
  {
    problem: "WebSocket keeps disconnecting",
    solutions: [
      "Check Settings → Connection for the correct host and port",
      "Restart the daemon process",
      "Look for port conflicts: netstat -tlnp | grep 8765",
      "The dashboard auto-reconnects — transient drops are normal",
    ],
  },
  {
    problem: "Compare view shows 'No active flow selected'",
    solutions: [
      "Select a primary trace using the Branch Alpha dropdown in the top bar",
      "Then select a second trace using the Branch Beta dropdown",
      "Both traces must have loaded events to generate a diff",
    ],
  },
  {
    problem: "Cache page is empty",
    solutions: [
      "Ensure you've wrapped LLM calls with @agentglass_vcr decorator",
      "Run the agent at least once to populate the cache",
      "If using events from the daemon, check that llm_response events exist in your traces",
    ],
  },
  {
    problem: "Events appear but graph is empty",
    solutions: [
      "Ensure events include valid parent_span_id relationships for graph edges",
      "Root events (no parent) should have parent_span_id set to null",
      "Check event_type is one of the recognized types (agent_start, agent_end, tool_call, etc.)",
    ],
  },
  {
    problem: "SDK client raises connection errors",
    solutions: [
      "Start the daemon first: npx @agentglass/cli up",
      "The client queues events and retries automatically — connection errors during daemon downtime are expected",
      "Set daemon_url explicitly: AgentGlassClient(daemon_url='http://127.0.0.1:8765')",
    ],
  },
];

const keyboardShortcuts = [
  { keys: ["↑", "↓"], action: "Navigate trace list in dropdown" },
  { keys: ["Enter"], action: "Select highlighted trace" },
  { keys: ["Esc"], action: "Close trace dropdown" },
  { keys: ["Space"], action: "Play/Pause timeline scrubber" },
  { keys: ["←", "→"], action: "Step through timeline events" },
];

const apiEndpoints = [
  { method: "POST", path: "/v1/events", description: "Ingest a batch of events (JSON array)" },
  { method: "GET", path: "/v1/traces", description: "List all traces with metadata" },
  { method: "GET", path: "/v1/traces/:id/events", description: "Get all events for a specific trace" },
  { method: "GET", path: "/v1/traces/:id/export", description: "Export trace as Pytest fixture" },
  { method: "POST", path: "/v1/commands", description: "Submit a God Mode command" },
  { method: "POST", path: "/v1/commands/poll", description: "Poll for pending commands (SDK)" },
  { method: "GET", path: "/health", description: "Daemon health check" },
  { method: "WS", path: "/ws", description: "WebSocket stream for real-time events" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function DocsPage() {
  return (
    <div className="docs-root">
      <header className="marketing-header docs-header">
        <Link href="/" className="marketing-brand" aria-label="AgentGlass home">
          <span className="marketing-brand-glyph">◇</span>
          <span className="marketing-brand-name">AgentGlass</span>
          <span className="marketing-brand-badge">Docs</span>
        </Link>
        <nav className="marketing-nav">
          <Link href="/" className="marketing-nav-link">
            Home
          </Link>
          <Link href="/live" className="marketing-nav-link marketing-nav-link-cta">
            Open Dashboard
          </Link>
        </nav>
      </header>

      <main className="docs-main">
        {/* Hero */}
        <section className="docs-hero">
          <p className="docs-kicker">Documentation</p>
          <h1>Build, inspect, and debug autonomous agent systems locally.</h1>
          <p>
            Complete guide to AgentGlass: architecture, SDK integration, dashboard features,
            and troubleshooting for teams building reliable multi-agent systems.
          </p>
        </section>

        {/* Table of Contents */}
        <section className="docs-toc">
          <h2>Contents</h2>
          <div className="docs-toc-grid">
            {tocItems.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </div>
        </section>

        {/* Quickstart */}
        <section id="quickstart" className="docs-steps">
          <h2>Quickstart</h2>
          <p className="docs-section-intro">
            Get from zero to a traced agent run in under 5 minutes.
          </p>
          <ol>
            <li>
              <strong>Start the local stack</strong>
              <pre>{`npx @agentglass/cli up
# → Daemon on http://127.0.0.1:8765
# → Dashboard on http://localhost:3456`}</pre>
            </li>
            <li>
              <strong>Install the Python SDK</strong>
              <pre>{`pip install agentglass-python`}</pre>
            </li>
            <li>
              <strong>Instrument your agent</strong>
              <pre>{`from agentglass_python import AgentGlassClient

client = AgentGlassClient()
trace_id = client.start_trace()

# Track events as your agent runs
client.track_event(
    event_type="agent_start",
    node_name="Researcher",
    payload={"topic": "multi-agent retries"}
)

# ... your agent logic here ...

client.track_event(
    event_type="agent_end",
    node_name="Researcher",
    payload={"result": "completed"}
)

client.close()`}</pre>
            </li>
            <li>
              <strong>Open the dashboard</strong> at{" "}
              <a href="http://localhost:3456/live">http://localhost:3456/live</a> — events
              appear in real time as your agent runs.
            </li>
          </ol>
        </section>

        {/* Architecture */}
        <section id="architecture" className="docs-rich-section">
          <h2>Architecture</h2>
          <p>
            AgentGlass is a local-first observability system for multi-agent AI runtimes.
            It captures what happened, when it happened, and why downstream behavior changed
            by turning agent activity into a deterministic event stream. Instead of debugging
            through scattered logs, you inspect an execution graph reconstructed from trace
            events.
          </p>
          <div className="docs-stack-grid">
            {architectureLayers.map((layer) => (
              <article key={layer.title} className="docs-stack-card">
                <h3>
                  {layer.title}
                </h3>
                <p>{layer.details}</p>
              </article>
            ))}
          </div>
          <h3>Data Flow</h3>
          <ol>
            <li>Agent process emits events with trace_id and span_id context.</li>
            <li>SDK batches events and sends to daemon over HTTP POST.</li>
            <li>Daemon validates, deduplicates, and persists to SQLite.</li>
            <li>Dashboard subscribes via WebSocket and bootstraps event history.</li>
            <li>UI derives graph + timeline + inspector from the canonical event source.</li>
          </ol>
        </section>

        {/* Event Model */}
        <section id="event-model" className="docs-rich-section">
          <h2>Event Model</h2>
          <p>
            Every persisted event includes identifiers, event type, payload, and timestamps.
            These fields allow deterministic ordering and replay of state transitions.
          </p>
          <div className="docs-table-wrap">
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                {eventFields.map((row) => (
                  <tr key={row.field}>
                    <td><code>{row.field}</code></td>
                    <td>{row.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Event Types</h3>
          <div className="docs-table-wrap">
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>When Emitted</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><code>agent_start</code></td><td>A node/agent begins execution</td></tr>
                <tr><td><code>agent_end</code></td><td>A node/agent completes successfully</td></tr>
                <tr><td><code>tool_call</code></td><td>A tool is invoked by an agent</td></tr>
                <tr><td><code>tool_result</code></td><td>A tool returns its result</td></tr>
                <tr><td><code>llm_request</code></td><td>An LLM API call is initiated</td></tr>
                <tr><td><code>llm_response</code></td><td>An LLM returns a response</td></tr>
                <tr><td><code>state_snapshot</code></td><td>Agent state is captured at a point in time</td></tr>
                <tr><td><code>error</code></td><td>An error occurs during execution</td></tr>
                <tr><td><code>state_injection</code></td><td>External state is injected via God Mode</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* SDK — Native Client */}
        <section id="sdk-native" className="docs-codeblock">
          <h2>SDK — Native Client</h2>
          <p className="docs-section-intro">
            Direct event emission with full control over trace and span identifiers.
          </p>
          <pre>
{`from agentglass_python import AgentGlassClient

client = AgentGlassClient(
    daemon_url="http://127.0.0.1:8765",
    flush_interval_ms=250,    # batch flush interval
    max_batch_size=50,        # events per batch
)

# Start a trace
trace_id = client.start_trace()

# Create a span (returns trace_id, span_id, parent_span_id)
tid, sid, pid = client.create_span()

# Emit events
client.track_event(
    event_type="agent_start",
    node_name="Researcher",
    payload={"topic": "multi-agent coordination"}
)

client.track_event(
    event_type="tool_call",
    node_name="web_search",
    payload={"query": "retry loops in multi-agent systems"}
)

# Always close when done
client.close()`}
          </pre>
        </section>

        {/* SDK — Decorator */}
        <section id="sdk-decorator" className="docs-codeblock">
          <h2>SDK — @with_agentglass Decorator</h2>
          <p className="docs-section-intro">
            Wrap functions with automatic span instrumentation. Supports sync and async.
            Nested decorators produce proper parent-child span hierarchies.
          </p>
          <pre>
{`from agentglass_python import AgentGlassClient, with_agentglass

client = AgentGlassClient()
trace_id = client.start_trace()

@with_agentglass(client, "Researcher", trace_id=trace_id)
def research(topic: str) -> str:
    # Nested call gets auto-linked as child span
    return search_web(topic)

@with_agentglass(client, "WebSearch", trace_id=trace_id)
def search_web(query: str) -> str:
    return f"Results for: {query}"

# Run — both spans emitted automatically
result = research("multi-agent retries")
client.close()

# Also works with async:
@with_agentglass(client, "AsyncAgent")
async def async_agent(input: str):
    return await some_async_call(input)`}
          </pre>
        </section>

        {/* SDK — OpenTelemetry */}
        <section id="sdk-otel" className="docs-codeblock">
          <h2>SDK — OpenTelemetry Integration</h2>
          <p className="docs-section-intro">
            Attach AgentGlass to existing OTel pipelines. All OTel spans are automatically
            forwarded as AgentGlass events.
          </p>
          <pre>
{`from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from agentglass_python.otel import AgentGlassSpanProcessor
from agentglass_python import AgentGlassClient

# Setup
client = AgentGlassClient()
provider = TracerProvider()
provider.add_span_processor(AgentGlassSpanProcessor(client))
trace.set_tracer_provider(provider)

# Now any OTel span automatically becomes an AgentGlass event
tracer = trace.get_tracer("my-agent")
with tracer.start_as_current_span("Researcher") as span:
    span.set_attribute("topic", "agent debugging")
    # ... your logic here ...`}
          </pre>
        </section>

        {/* SDK — LangGraph */}
        <section id="sdk-langgraph" className="docs-codeblock">
          <h2>SDK — LangGraph Adapter</h2>
          <p className="docs-section-intro">
            One-line instrumentation for compiled LangGraph StateGraphs. Automatically emits
            agent_start/agent_end/state_snapshot events for every node transition.
          </p>
          <pre>
{`from agentglass_python import AgentGlassClient
from agentglass_python.langgraph_adapter import instrument_langgraph

client = AgentGlassClient()

# Build and compile your LangGraph
graph = build_my_graph().compile()

# Instrument with one line
graph = instrument_langgraph(graph, client)

# Run — every node transition is traced
result = graph.invoke({"input": "analyze this dataset"})

client.close()`}
          </pre>
        </section>

        {/* SDK — VCR Cache */}
        <section id="sdk-vcr" className="docs-codeblock">
          <h2>SDK — VCR Cache (Zero-Cost Replays)</h2>
          <p className="docs-section-intro">
            Record LLM responses once, replay instantly. Deterministic caching eliminates
            repeated API costs during debug loops.
          </p>
          <pre>
{`from agentglass_python import AgentGlassClient, VCRCache, agentglass_vcr

client = AgentGlassClient()
vcr = VCRCache(
    db_path=".agentglass/vcr_cache.db",
    mode="auto"  # "record" | "playback" | "auto"
)

@agentglass_vcr(vcr, client=client)
def call_llm(model="gpt-4", messages=None):
    # First call: hits real API, caches response
    # Subsequent calls: returns cached response instantly
    import openai
    return openai.chat.completions.create(
        model=model, messages=messages
    )

# Run — cached responses show as "replayed" in the Cache Manager
result = call_llm(
    model="gpt-4",
    messages=[{"role": "user", "content": "Explain retry strategies"}]
)

# Cache management
vcr.clear()  # Wipe all cached responses
client.close()`}
          </pre>
        </section>

        {/* Dashboard Guide */}
        <section id="dashboard-guide" className="docs-rich-section">
          <h2>Dashboard Guide</h2>
          <p>
            The dashboard has four main views, accessible from the sidebar navigation.
            All views connect to the same daemon data source and update in real time.
          </p>
          <div className="docs-stack-grid">
            {dashboardViews.map((view) => (
              <article key={view.title} className="docs-stack-card">
                <h3>
                  {view.title}
                </h3>
                <p>{view.description}</p>
                <Link href={view.path} className="docs-view-link">
                  Open {view.title} →
                </Link>
              </article>
            ))}
          </div>
        </section>

        {/* Keyboard Shortcuts */}
        <section id="keyboard-shortcuts" className="docs-rich-section">
          <h2>Keyboard Shortcuts</h2>
          <div className="docs-table-wrap">
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Keys</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {keyboardShortcuts.map((shortcut) => (
                  <tr key={shortcut.action}>
                    <td>
                      {shortcut.keys.map((k) => (
                        <kbd key={k} className="docs-kbd">
                          {k}
                        </kbd>
                      ))}
                    </td>
                    <td>{shortcut.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Troubleshooting */}
        <section id="troubleshooting" className="docs-rich-section">
          <h2>Troubleshooting</h2>
          <p>Common issues and their solutions.</p>
          <div className="docs-trouble-grid">
            {troubleshootingItems.map((item) => (
              <article key={item.problem} className="docs-trouble-card">
                <h3>{item.problem}</h3>
                <ul>
                  {item.solutions.map((solution, i) => (
                    <li key={i}>{solution}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* API Reference */}
        <section id="api-reference" className="docs-rich-section">
          <h2>Daemon API Reference</h2>
          <p>
            The daemon exposes REST endpoints and a WebSocket stream. Default base URL is{" "}
            <code>http://127.0.0.1:8765</code>.
          </p>
          <div className="docs-table-wrap">
            <table className="docs-table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Path</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {apiEndpoints.map((ep) => (
                  <tr key={ep.path}>
                    <td>
                      <code className="docs-method-badge">{ep.method}</code>
                    </td>
                    <td>
                      <code>{ep.path}</code>
                    </td>
                    <td>{ep.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="docs-footer-cta">
          <h2>Ready to Debug?</h2>
          <p>
            Start the local stack and connect your agent. The dashboard will show
            execution graphs, timelines, and payloads as events arrive.
          </p>
          <div className="marketing-hero-actions">
            <Link href="/live" className="marketing-btn marketing-btn-primary">
              Go To Live Graph
            </Link>
            <Link
              href="https://github.com/VishalPainjane/AgentGlass"
              className="marketing-btn marketing-btn-ghost"
            >
              View Repository
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
