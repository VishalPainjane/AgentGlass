/**
 * AgentGlass interview demo orchestrator.
 *
 * Starts daemon + dashboard, waits for health, runs the canonical LangGraph demo,
 * and leaves the stack running for live inspection.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import open from "open";

const DAEMON_HEALTH_URL = "http://127.0.0.1:8765/health";
const DASHBOARD_URL = "http://localhost:3456";
const DAEMON_TRACES_URL = "http://127.0.0.1:8765/v1/traces";
const HEALTH_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 500;

export interface DemoOptions {
  openBrowser: boolean;
  build: boolean;
  skipInstall: boolean;
  compare: boolean;
  runGodMode: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function findRepoRoot(startDir: string): string {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(
    [
      "Could not find the AgentGlass repository root.",
      "",
      "Expected to find pnpm-workspace.yaml in the current directory or a parent folder.",
      "",
      "Run this command from inside the AgentGlass repo:",
      "  cd path/to/AgentGlass",
      "  pnpm demo",
    ].join("\n")
  );
}

function commandExistsAsync(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const check = process.platform === "win32" ? "where" : "which";
    const child = spawn(check, [command], { shell: true, stdio: "ignore" });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  label: string,
  extraEnv?: Record<string, string>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, ...extraEnv },
    });

    child.on("error", (error) => {
      reject(new Error(`${label} failed to start: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} exited with code ${code ?? "unknown"}`));
      }
    });
  });
}

function startBackgroundService(filter: string, cwd: string): ChildProcess {
  return spawn("pnpm", ["--filter", filter, "dev"], {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

async function pollUntilReady(
  url: string,
  label: string,
  timeoutMs: number
): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    [
      `${label} failed to become ready.`,
      "",
      `Expected: ${url}`,
      "",
      "Check:",
      "  - the port is not already in use",
      "  - dependencies are installed (pnpm install)",
      "  - Node.js 20+ is available",
      "  - daemon/dashboard logs above for errors",
    ].join("\n")
  );
}

async function resolvePythonCommand(): Promise<string> {
  if (await commandExistsAsync("python")) {
    return "python";
  }
  if (await commandExistsAsync("python3")) {
    return "python3";
  }
  throw new Error(
    [
      "Python was not found on PATH.",
      "",
      "Install Python 3.10+ and ensure `python` or `python3` is available.",
      "",
      "Then re-run:",
      "  pnpm demo",
    ].join("\n")
  );
}

async function clearDaemonTraces(): Promise<void> {
  try {
    const response = await fetch(`${DAEMON_HEALTH_URL.replace("/health", "")}/v1/system/clear`, {
      method: "POST",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      console.log("→ Cleared previous traces for a clean demo view");
    }
  } catch {
    console.log("→ Could not clear traces (daemon may still be starting)");
  }
}

async function verifyTraceIngested(minTraces = 1): Promise<void> {
  const response = await fetch(DAEMON_TRACES_URL, {
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Daemon trace API returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as { traces?: Array<{ trace_id: string; event_count: number }> };
  const traces = data.traces ?? [];

  if (traces.length < minTraces) {
    throw new Error(
      [
        "Demo agent finished but no traces were found in the daemon.",
        "",
        "Expected at least one trace at:",
        `  ${DAEMON_TRACES_URL}`,
        "",
        "Check:",
        "  - daemon is running on port 8765",
        "  - Python SDK can reach http://127.0.0.1:8765",
        "  - demo_support_research_agent.py completed without connection errors",
      ].join("\n")
    );
  }

  const totalEvents = traces.reduce((sum, trace) => sum + (trace.event_count ?? 0), 0);
  if (totalEvents === 0) {
    throw new Error("Traces were created but contained zero events. Check SDK flush and daemon ingest.");
  }
}

export async function runDemo(options: DemoOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());

  if (!(await commandExistsAsync("pnpm"))) {
    throw new Error(
      [
        "pnpm was not found on PATH.",
        "",
        "Install pnpm 9+ (https://pnpm.io/installation), then run:",
        "  pnpm install",
        "  pnpm demo",
      ].join("\n")
    );
  }

  const pythonCmd = await resolvePythonCommand();
  const sdkPath = join(repoRoot, "sdk-python");
  const demoScript = join(sdkPath, "examples", "demo_support_research_agent.py");
  const godModeScript = join(sdkPath, "examples", "demo_god_mode.py");

  if (!existsSync(demoScript)) {
    throw new Error(`Canonical demo script not found: ${demoScript}`);
  }

  console.log("\n◇ AgentGlass Interview Demo\n");
  console.log(`Repository: ${repoRoot}\n`);

  if (!options.skipInstall) {
    if (!existsSync(join(repoRoot, "node_modules"))) {
      console.log("→ Installing Node dependencies (pnpm install)…");
      await runProcess("pnpm", ["install"], repoRoot, "pnpm install");
    }

    console.log("→ Installing Python SDK (editable, with LangGraph extra)…");
    await runProcess(
      pythonCmd,
      ["-m", "pip", "install", "-e", ".[langgraph]", "--quiet"],
      sdkPath,
      "pip install agentglass-python"
    );
  }

  if (options.build) {
    console.log("→ Building monorepo (pnpm build)…");
    await runProcess("pnpm", ["build"], repoRoot, "pnpm build");
  }

  console.log("→ Starting daemon and dashboard (dev mode)…");
  const daemon = startBackgroundService("@agentglass/daemon", repoRoot);
  const dashboard = startBackgroundService("@agentglass/dashboard", repoRoot);

  const shutdown = () => {
    console.log("\n→ Shutting down AgentGlass services…");
    daemon.kill("SIGINT");
    dashboard.kill("SIGINT");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  daemon.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`Daemon exited unexpectedly with code ${code}`);
    }
  });

  dashboard.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`Dashboard exited unexpectedly with code ${code}`);
    }
  });

  console.log("→ Waiting for daemon health…");
  await pollUntilReady(DAEMON_HEALTH_URL, "AgentGlass daemon", HEALTH_TIMEOUT_MS);

  console.log("→ Waiting for dashboard…");
  await pollUntilReady(DASHBOARD_URL, "AgentGlass dashboard", HEALTH_TIMEOUT_MS);

  await clearDaemonTraces();

  const pythonEnv =
    process.platform === "win32"
      ? { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" }
      : undefined;

  console.log("→ Running Enterprise Support Research Agent (variant A)…");
  console.log("   LLM priority: Ollama (local) → Groq → OpenAI → fallback");
  console.log("   Ensure Ollama is running: ollama serve && ollama pull llama3.2:1b");
  await runProcess(pythonCmd, [demoScript, "--variant", "a"], sdkPath, "demo_support_research_agent.py", pythonEnv);

  if (options.compare) {
    console.log("→ Running second trace for Compare (variant B — compliance failure)…");
    await runProcess(pythonCmd, [demoScript, "--variant", "b"], sdkPath, "demo_support_research_agent.py", pythonEnv);
  }

  console.log("→ Verifying traces in daemon…");
  await verifyTraceIngested(options.compare ? 2 : 1);

  if (options.runGodMode) {
    console.log("\n→ God Mode demo is interactive — run it in a second terminal:");
    console.log(`  cd ${sdkPath}`);
    console.log(`  ${pythonCmd} examples/demo_god_mode.py`);
    console.log("  Then open God Mode (⚡) in the dashboard and inject state.\n");
  }

  if (options.openBrowser) {
    await open(`${DASHBOARD_URL}/live`);
  }

  console.log("\n✅ AgentGlass demo is ready.\n");
  console.log(`Dashboard:  ${DASHBOARD_URL}/live`);
  console.log(`Compare:    ${DASHBOARD_URL}/compare`);
  console.log(`Daemon:     http://127.0.0.1:8765`);
  console.log(`Traces API: ${DAEMON_TRACES_URL}`);
  console.log("\nNext steps:");
  console.log("  1. Open /live — select a trace, click nodes, scrub the timeline");
  if (options.compare) {
    console.log("  2. Open /compare — pick two traces and review diffs");
  } else {
    console.log("  2. Re-run with compare: pnpm demo -- --compare");
  }
  console.log("  3. God Mode: pnpm demo -- --god-mode  (then run demo_god_mode.py in another terminal)");
  console.log("\nPress Ctrl+C to stop daemon and dashboard.\n");

  await new Promise<void>(() => {
    // Keep services running until interrupted.
  });
}
