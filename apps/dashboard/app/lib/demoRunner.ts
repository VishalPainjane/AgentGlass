/**
 * Landing page helper — checks daemon availability before sending users to /live.
 * Showcase deployments skip the daemon and load bundled traces instead.
 */

import { isShowcaseMode } from "./showcaseMode";

export async function checkDaemonReady(): Promise<void> {
  if (isShowcaseMode()) {
    return;
  }

  const { getDaemonHttpBaseUrl } = await import("./daemonApi");
  const response = await fetch(`${getDaemonHttpBaseUrl()}/health`, {
    signal: AbortSignal.timeout(3_000),
  });

  if (!response.ok) {
    throw new Error(`Daemon health check failed (HTTP ${response.status})`);
  }
}

export function isPublicShowcase(): boolean {
  return isShowcaseMode();
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
