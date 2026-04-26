import Link from "next/link";

const docsSections = [
  {
    id: "how-it-works",
    title: "How AgentGlass Works",
    content:
      "AgentGlass captures agent events (start, tool calls, LLM IO, errors) and stores them locally in a daemon-backed SQLite timeline. The dashboard turns these events into a deterministic execution graph you can replay frame-by-frame.",
  },
  {
    id: "architecture",
    title: "Architecture",
    content:
      "The stack has three layers: Python instrumentation SDK, local daemon ingest/storage, and a Next.js dashboard. Payload blobs are offloaded to disk for performance, while trace metadata remains query-fast in SQLite.",
  },
  {
    id: "concepts",
    title: "Core Concepts",
    content:
      "A trace is one complete run. A span is one agent/tool node inside that run. Events form the state transitions of each span. Time-travel works by rebuilding graph state from events up to a selected timestamp.",
  },
  {
    id: "usage",
    title: "Using It in Practice",
    content:
      "Start the local stack, instrument your agent code, execute workflows, then inspect and compare traces in the UI. For iterative prompt debugging, pair with VCR cache to replay expensive LLM steps instantly.",
  },
];

const architectureLayers = [
  {
    title: "Instrumentation Layer",
    details:
      "Python SDK emits normalized events for agent lifecycle, tool execution, LLM requests/responses, and state snapshots. OpenTelemetry integration is supported via AgentGlassSpanProcessor.",
  },
  {
    title: "Ingest + Storage Layer",
    details:
      "A local daemon receives events over HTTP/WebSocket, deduplicates by ingest semantics, persists metadata to SQLite, and stores large payloads as blobs on disk for UI responsiveness.",
  },
  {
    title: "Visualization Layer",
    details:
      "Next.js dashboard renders timeline + graph + inspector views from persisted events, supports replay via timestamp slicing, and offers trace comparison for branch-level debugging.",
  },
];

const dashboardGuides = [
  {
    title: "Live Graph",
    description:
      "Inspect span topology in real-time, open node inspector payloads, and scrub timeline state to replay exact execution windows.",
  },
  {
    title: "Compare Traces",
    description:
      "Diff two traces side-by-side to evaluate prompt updates, tool behavior differences, and downstream response drift.",
  },
  {
    title: "Cache Manager",
    description:
      "Use VCR-style cache replay during debugging loops to avoid repeated model costs while preserving deterministic behavior.",
  },
  {
    title: "Settings",
    description:
      "Configure local runtime preferences and control dashboard behavior for your development workflow.",
  },
];

const integrationPatterns = [
  {
    title: "LangGraph Applications",
    description:
      "Instrument compiled LangGraph pipelines and stream values while preserving trace/span continuity for each node transition.",
  },
  {
    title: "OpenTelemetry Pipelines",
    description:
      "Attach AgentGlass span processor to existing OTel setups when your platform already uses standardized tracing infrastructure.",
  },
  {
    title: "Custom Agent Runtimes",
    description:
      "Use direct SDK events for proprietary orchestration engines and map internal lifecycle states to AgentGlass event types.",
  },
];

const bestPractices = [
  {
    title: "Use Stable Node Naming",
    description:
      "Consistent node names across runs make compare mode and regression analysis significantly easier to interpret.",
  },
  {
    title: "Emit Structured Payloads",
    description:
      "Prefer typed, compact payloads over free-form logs to keep node inspector useful and timeline filtering reliable.",
  },
  {
    title: "Mark Errors Explicitly",
    description:
      "Emit dedicated error events with meaningful context so root cause analysis is visible in graph status and event stream.",
  },
  {
    title: "Capture Branching Intentionally",
    description:
      "When testing prompt or policy variants, keep trace boundaries clean to maximize side-by-side compare readability.",
  },
];

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
            Open Product
          </Link>
        </nav>
      </header>

      <main className="docs-main">
        <section className="docs-hero">
          <p className="docs-kicker">Documentation</p>
          <h1>Build, inspect, and debug autonomous agent systems locally.</h1>
          <p>
            This guide explains architecture, data model, integration patterns, and practical workflows for
            teams building reliable multi-agent systems with AgentGlass.
          </p>
        </section>

        <section className="docs-toc">
          <h2>Contents</h2>
          <div className="docs-toc-grid">
            <a href="#overview">Overview</a>
            <a href="#architecture-deep">Architecture</a>
            <a href="#event-model">Event Model</a>
            <a href="#setup">Setup and Integration</a>
            <a href="#dashboard-guide">Dashboard Guide</a>
            <a href="#integration-patterns">Integration Patterns</a>
            <a href="#best-practices">Best Practices</a>
          </div>
        </section>

        <section id="overview" className="docs-rich-section">
          <h2>Overview</h2>
          <p>
            AgentGlass is a local-first observability system for multi-agent AI runtimes. It captures what
            happened, when it happened, and why downstream behavior changed by turning agent activity into a
            deterministic event stream. Instead of debugging through scattered logs, you inspect an execution
            graph reconstructed from trace events.
          </p>
          <p>
            The platform is designed for privacy-sensitive and cost-sensitive debugging. By default, traces
            are processed locally and can be replayed without sending internal context to third-party services.
          </p>
        </section>

        <section className="docs-grid">
          {docsSections.map((section) => (
            <article className="docs-card" id={section.id} key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.content}</p>
            </article>
          ))}
        </section>

        <section id="architecture-deep" className="docs-rich-section">
          <h2>Architecture Deep Dive</h2>
          <div className="docs-stack-grid">
            {architectureLayers.map((layer) => (
              <article key={layer.title} className="docs-stack-card">
                <h3>{layer.title}</h3>
                <p>{layer.details}</p>
              </article>
            ))}
          </div>
          <ol>
            <li>Agent process emits events with trace_id and span_id context.</li>
            <li>Daemon validates and persists event metadata.</li>
            <li>Large payloads are represented as blob references.</li>
            <li>Dashboard subscribes to daemon stream and bootstraps event history.</li>
            <li>UI derives graph + timeline + node state from the same canonical event source.</li>
          </ol>
        </section>

        <section id="event-model" className="docs-rich-section">
          <h2>Event Model</h2>
          <p>
            Every persisted event includes identifiers, event type, payload, and timestamps. These fields allow
            deterministic ordering and replay of state transitions.
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
                <tr>
                  <td>trace_id</td>
                  <td>Groups all events for one workflow run.</td>
                </tr>
                <tr>
                  <td>span_id</td>
                  <td>Identifies a single node (agent/tool) lifecycle in the graph.</td>
                </tr>
                <tr>
                  <td>parent_span_id</td>
                  <td>Defines graph edge relationships for orchestration flow.</td>
                </tr>
                <tr>
                  <td>event_type</td>
                  <td>Lifecycle signal such as agent_start, tool_call, llm_response, error.</td>
                </tr>
                <tr>
                  <td>payload</td>
                  <td>Structured contextual data for that transition (prompt, result, state).</td>
                </tr>
                <tr>
                  <td>timestamp</td>
                  <td>Microsecond precision ordering for replay and timeline slicing.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="setup" className="docs-steps">
          <h2>Quick Start Workflow</h2>
          <ol>
            <li>Run <code>npx @agentglass/cli up</code> to start daemon and dashboard locally.</li>
            <li>Install SDK: <code>pip install agentglass-python</code>.</li>
            <li>Wrap your agent flow with AgentGlass client or OpenTelemetry span processor.</li>
            <li>Execute runs, then inspect spans, payloads, and timelines inside the Live Graph.</li>
          </ol>
        </section>

        <section className="docs-codeblock">
          <h2>Python Instrumentation Example</h2>
          <pre>
{`from agentglass_python import AgentGlassClient

client = AgentGlassClient()
trace_id = client.start_trace()

with client.create_span("agent_start", "Researcher", {"topic": "multi-agent retries"}):
    client.track(
        event_type="tool_call",
        node_name="web_search",
        payload={"query": "retry loops in multi-agent systems"}
    )
`}
          </pre>
        </section>

        <section className="docs-codeblock">
          <h2>OpenTelemetry Integration Example</h2>
          <pre>
{`from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from agentglass_python.otel import AgentGlassSpanProcessor
from agentglass_python import AgentGlassClient

provider = TracerProvider()
provider.add_span_processor(AgentGlassSpanProcessor(AgentGlassClient()))
trace.set_tracer_provider(provider)
`}
          </pre>
        </section>

        <section id="dashboard-guide" className="docs-rich-section">
          <h2>Dashboard Usage Guide</h2>
          <div className="docs-stack-grid">
            {dashboardGuides.map((guide) => (
              <article key={guide.title} className="docs-stack-card">
                <h3>{guide.title}</h3>
                <p>{guide.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="integration-patterns" className="docs-rich-section">
          <h2>Integration Patterns</h2>
          <div className="docs-stack-grid">
            {integrationPatterns.map((item) => (
              <article key={item.title} className="docs-stack-card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="best-practices" className="docs-rich-section">
          <h2>Best Practices</h2>
          <div className="docs-trouble-grid">
            {bestPractices.map((item) => (
              <article key={item.title} className="docs-trouble-card">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="docs-footer-cta">
          <h2>Next Steps</h2>
          <p>
            Use the landing page for external positioning, and use the Live Graph for operational debugging.
            This split mirrors how modern OSS startups separate product narrative from product runtime.
          </p>
          <div className="marketing-hero-actions">
            <Link href="/live" className="marketing-btn marketing-btn-primary">
              Go To Live Graph
            </Link>
            <Link href="https://github.com/VishalPainjane/AgentGlass" className="marketing-btn marketing-btn-ghost">
              View Repository
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
