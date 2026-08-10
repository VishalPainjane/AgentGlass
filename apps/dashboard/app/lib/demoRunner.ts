/**
 * Landing page helper — checks daemon availability before sending users to /live.
 * Does NOT inject synthetic traces. Real telemetry comes from the Python SDK.
 */

const DAEMON_HEALTH_URL = "http://127.0.0.1:8765/health";

export async function checkDaemonReady(): Promise<void> {
  const response = await fetch(DAEMON_HEALTH_URL, {
    signal: AbortSignal.timeout(3_000),
  });

  if (!response.ok) {
    throw new Error(`Daemon health check failed (HTTP ${response.status})`);
  }
}

export function getDemoStartInstructions(): string {
  return [
    "One-time setup:",
    "  .\\scripts\\setup-ollama.ps1",
    "  pnpm install",
    "",
    "Every-run demo (from repository root):",
    "  pnpm demo -- --compare",
    "",
    "Faster re-run (services already up):",
    "  cd sdk-python",
    "  python examples/demo_support_research_agent.py --variant a",
    "  python examples/demo_support_research_agent.py --variant b",
    "",
    "Cloud LLM override (optional):",
    "  set AGENTGLASS_LLM_PROVIDER=ollama|groq|openai",
    "  set GROQ_API_KEY=your_key",
  ].join("\n");
}
