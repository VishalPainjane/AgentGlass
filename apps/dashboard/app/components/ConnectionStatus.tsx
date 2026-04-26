/**
 * ConnectionStatus — WebSocket health indicator
 */

"use client";

import { motion } from "framer-motion";
import { useTraceStore } from "../hooks/useTraceStore";

const STATUS_MAP = {
  connected: { color: "#4ade80", label: "Connected" },
  connecting: { color: "#fbbf24", label: "Connecting…" },
  disconnected: { color: "#f87171", label: "Disconnected" },
} as const;

export default function ConnectionStatus() {
  const connectionStatus = useTraceStore((s) => s.connectionStatus);
  const { color, label } = STATUS_MAP[connectionStatus];

  return (
    <div className="connection-status">
      <motion.div
        className="connection-dot"
        style={{ backgroundColor: color }}
        animate={
          connectionStatus === "connecting"
            ? { scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }
            : {}
        }
        transition={
          connectionStatus === "connecting"
            ? { duration: 1.2, repeat: Infinity }
            : {}
        }
      />
      <span className="connection-label">{label}</span>
    </div>
  );
}
