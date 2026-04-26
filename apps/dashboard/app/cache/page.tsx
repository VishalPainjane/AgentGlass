"use client";

import TopBar from "../components/TopBar";

export default function CachePage() {
  return (
    <div className="dashboard">
      <TopBar />
      <div className="dashboard-body" style={{ padding: "40px", flexDirection: "column" }}>
        <h1 style={{ fontSize: "24px", marginBottom: "16px" }}>VCR Cache Manager</h1>
        <p style={{ color: "var(--text-muted)", maxWidth: "600px", lineHeight: "1.6" }}>
          The AgentGlass VCR intercepts LLM API calls and caches responses deterministically. 
          Use the CLI command <code>agentglass cache clear</code> to wipe the cache.
          <br /><br />
          (A full UI for exploring cached prompt-response pairs is planned for an upcoming release).
        </p>
      </div>
    </div>
  );
}
