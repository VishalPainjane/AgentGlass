import Link from "next/link";

const featureCards = [
  {
    title: "Deterministic Time-Travel",
    description:
      "Replay agent execution to an exact timestamp and inspect every span transition without guesswork.",
  },
  {
    title: "Local-First by Default",
    description:
      "Daemon, storage, and trace rendering run on your machine. No forced cloud telemetry or data egress.",
  },
  {
    title: "Branch-Aware Debugging",
    description:
      "Compare traces side-by-side to evaluate prompt changes, tool behavior differences, and regressions quickly.",
  },
  {
    title: "Framework Integrations",
    description:
      "Use native SDK hooks, OpenTelemetry span processing, and LangGraph adapters with minimal setup.",
  },
];

const workflow = [
  {
    step: "01",
    title: "Instrument",
    description: "Wrap agents with AgentGlass SDK or OTel span processor to emit structured events.",
  },
  {
    step: "02",
    title: "Run",
    description: "Execute your workflow. The local daemon ingests and persists spans and payload references.",
  },
  {
    step: "03",
    title: "Inspect",
    description: "Use Live Graph, timeline scrubber, and node inspector to locate breakpoints and root causes.",
  },
];

export default function LandingPage() {
  return (
    <div className="landing-root">
      <header className="marketing-header">
        <Link href="/" className="marketing-brand" aria-label="AgentGlass home">
          <span className="marketing-brand-glyph">◇</span>
          <span className="marketing-brand-name">AgentGlass</span>
          <span className="marketing-brand-badge">v0.1</span>
        </Link>
        <nav className="marketing-nav">
          <Link href="/docs" className="marketing-nav-link">
            Documentation
          </Link>
          <Link href="/live" className="marketing-nav-link">
            Product
          </Link>
          <a href="https://github.com/VishalPainjane/AgentGlass" className="marketing-nav-link">
            GitHub
          </a>
        </nav>
      </header>

      <main className="landing-main">
        <section className="marketing-hero">
          <p className="marketing-kicker">Open-Source Agent Observability</p>
          <h1>Debug autonomous multi-agent systems like you debug code.</h1>
          <p>
            AgentGlass gives you local-first trace observability, deterministic replay, and graph-level
            diagnostics for complex LLM workflows without handing sensitive context to third-party SaaS.
          </p>
          <div className="marketing-hero-actions">
            <Link href="/live" className="marketing-btn marketing-btn-primary">
              Open Live Product
            </Link>
            <Link href="/docs" className="marketing-btn marketing-btn-ghost">
              Read Documentation
            </Link>
          </div>
        </section>

        <section className="marketing-proof">
          <div className="marketing-proof-item">
            <p className="proof-value">100% Local</p>
            <p className="proof-label">No mandatory cloud relay</p>
          </div>
          <div className="marketing-proof-item">
            <p className="proof-value">Trace Replay</p>
            <p className="proof-label">Microsecond-level timeline scrub</p>
          </div>
          <div className="marketing-proof-item">
            <p className="proof-value">OSS Native</p>
            <p className="proof-label">Built for developer-owned workflows</p>
          </div>
        </section>

        <section className="marketing-section">
          <div className="marketing-section-header">
            <p>Capabilities</p>
            <h2>Production-grade visibility for agent stacks</h2>
          </div>
          <div className="marketing-feature-grid">
            {featureCards.map((feature) => (
              <article key={feature.title} className="marketing-feature-card">
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-section">
          <div className="marketing-section-header">
            <p>Workflow</p>
            <h2>From instrumentation to root-cause in minutes</h2>
          </div>
          <div className="marketing-workflow-grid">
            {workflow.map((item) => (
              <article key={item.step} className="marketing-workflow-card">
                <span>{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-docs-strip">
          <div>
            <p className="marketing-kicker">Documentation</p>
            <h2>Clear, implementation-focused docs for teams shipping agent systems.</h2>
            <p>
              Includes architecture, SDK instrumentation patterns, local stack operations, and practical
              workflows for debugging tool chains and orchestration errors.
            </p>
          </div>
          <div className="marketing-hero-actions">
            <Link href="/docs" className="marketing-btn marketing-btn-primary">
              Explore Docs
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
