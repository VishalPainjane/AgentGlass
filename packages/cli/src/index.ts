#!/usr/bin/env node

import { spawn, type ChildProcess } from "node:child_process";
import { Command } from "commander";
import open from "open";
import { runDemo } from "./demo.js";
import { formatEvaluationCli, type TraceEvaluation } from "./eval.js";

const DAEMON_BASE = "http://127.0.0.1:8765";

function startPackageDevServer(filter: string): ChildProcess {
  const useShell = process.platform === "win32";

  return spawn("pnpm", ["--filter", filter, "dev"], {
    stdio: "inherit",
    shell: useShell
  });
}

async function runUp(openBrowser: boolean): Promise<void> {
  const daemon = startPackageDevServer("@agentglass/daemon");
  const dashboard = startPackageDevServer("@agentglass/dashboard");

  const shutdown = () => {
    daemon.kill("SIGINT");
    dashboard.kill("SIGINT");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  if (openBrowser) {
    await open("http://localhost:3456");
  }

  console.log("AgentGlass local stack started");
  console.log("Dashboard: http://localhost:3456");
  console.log("Daemon: http://127.0.0.1:8765");
}

const program = new Command();

program
  .name("agentglass")
  .description("Local-first observability and time-travel debugging stack for agents")
  .version("0.1.0")
  .action(() => {
    program.help();
  });

program
  .command("up")
  .option("--no-open", "Do not open the browser automatically")
  .action(async (options: { open: boolean }) => {
    await runUp(options.open);
  });

program
  .command("demo")
  .description("Start AgentGlass and run the canonical LangGraph interview demo")
  .option("--no-open", "Do not open the browser automatically")
  .option("--build", "Run pnpm build before starting (optional)")
  .option("--skip-install", "Skip pnpm install and pip install")
  .option("--compare", "Run a second trace for the Compare page")
  .option("--god-mode", "Print God Mode instructions after startup")
  .action(async (options: {
    open: boolean;
    build: boolean;
    skipInstall: boolean;
    compare: boolean;
    godMode: boolean;
  }) => {
    await runDemo({
      openBrowser: options.open,
      build: options.build,
      skipInstall: options.skipInstall,
      compare: options.compare,
      runGodMode: options.godMode,
    });
  });

program.command("status").action(async () => {
  try {
    const health = await fetch(`${DAEMON_BASE}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (health.ok) {
      console.log(`AgentGlass daemon: running (${DAEMON_BASE})`);
    } else {
      console.log("AgentGlass daemon: unreachable");
    }
  } catch {
    console.log("AgentGlass daemon: not running");
    console.log("Start with: agentglass up  or  agentglass demo");
  }
});

program
  .command("eval")
  .description("Run deterministic evaluators against a trace")
  .argument("<trace-id>", "Trace UUID (full or unique prefix)")
  .option("--refresh", "Recompute evaluation even if cached")
  .option("--semantic", "Also run the local Ollama answer_groundedness evaluator")
  .action(async (traceId: string, options: { refresh?: boolean; semantic?: boolean }) => {
    try {
      const tracesRes = await fetch(`${DAEMON_BASE}/v1/traces`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!tracesRes.ok) {
        console.error("Daemon unreachable. Start with: agentglass up");
        process.exit(1);
      }

      const { traces } = (await tracesRes.json()) as {
        traces: Array<{ trace_id: string }>;
      };

      const match =
        traces.find((t) => t.trace_id === traceId) ??
        traces.find((t) => t.trace_id.startsWith(traceId));

      if (!match) {
        console.error(`Trace not found: ${traceId}`);
        process.exit(1);
      }

      const params = new URLSearchParams();
      if (options.refresh) params.set("refresh", "true");
      if (options.semantic) params.set("semantic", "true");
      const query = params.toString();

      const url = `${DAEMON_BASE}/v1/traces/${match.trace_id}/evaluation${
        query ? `?${query}` : ""
      }`;
      const evalRes = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!evalRes.ok) {
        const body = await evalRes.text();
        console.error(`Evaluation failed (${evalRes.status}): ${body}`);
        process.exit(1);
      }

      const evaluation = (await evalRes.json()) as TraceEvaluation;
      console.log(formatEvaluationCli(evaluation));
      process.exit(evaluation.passed ? 0 : 1);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command("cache")
  .description("Manage AgentGlass local caches")
  .addCommand(
    new Command("clear")
      .description("Clear the VCR LLM cache")
      .action(async () => {
        const fs = await import("fs");
        const path = await import("path");
        const vcrCachePath = path.join(process.cwd(), ".agentglass", "vcr_cache.db");
        if (fs.existsSync(vcrCachePath)) {
          fs.unlinkSync(vcrCachePath);
          console.log(`Cleared VCR cache at ${vcrCachePath}`);
        } else {
          console.log("No VCR cache found.");
        }
      })
  );

program.parseAsync(process.argv).catch((error) => {
  console.error(error);
  process.exit(1);
});
