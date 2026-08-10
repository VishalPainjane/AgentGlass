"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTraceStore, useSelectedNodeEvents } from "../hooks/useTraceStore";
import { daemonHttp } from "../lib/daemonApi";

export default function GodModeDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<Array<{ id: string; text: string; type: "info" | "success" | "error" | "command" }>>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const selectedSpanId = useTraceStore(s => s.selectedSpanId);
  const selectedTraceId = useTraceStore(s => s.selectedTraceId);
  const nodeEvents = useSelectedNodeEvents();
  
  const actualTraceId = selectedTraceId || nodeEvents[0]?.trace_id;

  const appendLog = (text: string, type: "info" | "success" | "error" | "command" = "info") => {
    setLogs(prev => [...prev, { id: Math.random().toString(36).substring(7), text, type }]);
  };

  useEffect(() => {
    if (isOpen && logs.length === 0) {
      appendLog("God Mode initialized. Type a command or 'help' for available commands.", "info");
    }
  }, [isOpen]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    const cmd = command.trim();
    setCommand("");
    appendLog(`> ${cmd}`, "command");

    if (cmd.toLowerCase() === "help") {
      appendLog("Available Commands:");
      appendLog("  inject <field> = <value>   - Inject state into selected node");
      appendLog("  force-tool <tool_name>     - Force execution of a tool");
      appendLog("  override <event_type> <val>- Override next event payload");
      appendLog("  clear                      - Clear this console");
      return;
    }

    if (cmd.toLowerCase() === "clear") {
      setLogs([]);
      return;
    }

    if (!actualTraceId) {
      appendLog("Error: No active trace selected.", "error");
      return;
    }

    if (!selectedSpanId) {
      appendLog("Error: You must select a node in the graph to target a command.", "error");
      return;
    }

    // Basic parser
    let commandType = "unknown";
    let payloadStr = "{}";

    if (cmd.startsWith("inject ")) {
      commandType = "inject";
      const parts = cmd.substring(7).split("=");
      if (parts.length >= 2) {
        payloadStr = JSON.stringify({ field: parts[0].trim(), value: parts.slice(1).join("=").trim() });
      } else {
        appendLog("Error: inject requires format: inject field = value", "error");
        return;
      }
    } else if (cmd.startsWith("force-tool ")) {
      const isDryRun = cmd.includes("--dry-run");
      const toolName = cmd.substring(11).replace("--dry-run", "").trim();
      
      if (!isDryRun && !window.confirm(`Are you sure you want to force-execute the tool: ${toolName}?`)) {
        appendLog("Command cancelled by user.", "info");
        return;
      }
      
      commandType = "force-tool";
      payloadStr = JSON.stringify({ tool_name: toolName, dry_run: isDryRun });
    } else if (cmd.startsWith("override ")) {
      commandType = "override";
      const parts = cmd.substring(9).split(" ");
      if (parts.length >= 2) {
        payloadStr = JSON.stringify({ event_type: parts[0], value: parts.slice(1).join(" ") });
      }
    } else {
      appendLog(`Unknown command: ${cmd}`, "error");
      return;
    }

    try {
      const res = await fetch(daemonHttp("/v1/commands"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trace_id: actualTraceId,
          target_span: selectedSpanId,
          command_type: commandType,
          payload: payloadStr
        }),
      });

      if (!res.ok) throw new Error("Failed to send command to daemon");
      const data = await res.json();
      appendLog(`Command queued [ID: ${data.id.substring(0, 8)}]. Awaiting agent acknowledgment...`, "success");
    } catch (err) {
      appendLog(`Network error: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: "35vh",
            minHeight: "250px",
            backgroundColor: "rgba(15, 23, 42, 0.95)",
            backdropFilter: "blur(12px)",
            borderTop: "1px solid #334155",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            fontFamily: "var(--font-mono), monospace",
            boxShadow: "0 -10px 40px rgba(0,0,0,0.5)"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", backgroundColor: "#1e293b", borderBottom: "1px solid #334155" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#ef4444", boxShadow: "0 0 8px #ef4444" }}></div>
              <span style={{ color: "#f8fafc", fontWeight: "bold", letterSpacing: "1px" }}>GOD MODE LIVE INJECTION</span>
              {selectedSpanId && (
                <span style={{ marginLeft: "12px", color: "#94a3b8", fontSize: "0.85rem" }}>
                  Target: {selectedSpanId.substring(0,8)}...
                </span>
              )}
            </div>
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "1.2rem" }}>
              ✕
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: "4px" }}>
            {logs.map((log) => (
              <div key={log.id} style={{ 
                color: log.type === "error" ? "#ef4444" : log.type === "success" ? "#22c55e" : log.type === "command" ? "#f1f5f9" : "#94a3b8",
                opacity: log.type === "command" ? 1 : 0.9,
                fontSize: "0.9rem"
              }}>
                {log.text}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>

          <form onSubmit={handleCommand} style={{ display: "flex", padding: "12px 16px", borderTop: "1px solid #334155", backgroundColor: "rgba(0,0,0,0.2)" }}>
            <span style={{ color: "#22c55e", marginRight: "12px", fontSize: "1.1rem", display: "flex", alignItems: "center" }}>❯</span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={selectedSpanId ? "Enter command (e.g. inject temperature = 0.0)" : "Select a node in the graph first..."}
              disabled={!selectedSpanId}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#f8fafc",
                fontFamily: "inherit",
                fontSize: "1rem"
              }}
              autoFocus
              autoComplete="off"
            />
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}