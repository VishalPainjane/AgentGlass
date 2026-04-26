#!/usr/bin/env node

import { spawn, type ChildProcess } from "node:child_process";
import { Command } from "commander";
import open from "open";

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
    await open("http://localhost:3000");
  }

  console.log("AgentGlass local stack started");
  console.log("Dashboard: http://localhost:3000");
  console.log("Daemon: http://127.0.0.1:7777");
}

const program = new Command();

program
  .name("agentglass")
  .description("Local-first observability and time-travel debugging stack for agents")
  .version("0.1.0");

program
  .command("up")
  .option("--no-open", "Do not open the browser automatically")
  .action(async (options: { open: boolean }) => {
    await runUp(options.open);
  });

program.command("status").action(() => {
  console.log("Scaffold installed. Start with: agentglass up");
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
