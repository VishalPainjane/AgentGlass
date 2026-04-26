/**
 * AgentNode — Custom React Flow node component
 *
 * Renders each agent/node in the graph with status-based
 * coloring, pulse animations for active nodes, and click-
 * to-inspect behaviour.
 */

"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import type { NodeStatus } from "../lib/eventHelpers";
import { getStatusColor } from "../lib/eventHelpers";
import { useTraceStore } from "../hooks/useTraceStore";

export interface AgentNodeData {
  label: string;
  status: NodeStatus;
  eventCount: number;
  spanId: string;
  [key: string]: unknown;
}

function AgentNodeComponent({ data }: NodeProps) {
  const nodeData = data as unknown as AgentNodeData;
  const { label, status, eventCount, spanId } = nodeData;
  const selectedSpanId = useTraceStore((s) => s.selectedSpanId);
  const selectNode = useTraceStore((s) => s.selectNode);
  const isSelected = selectedSpanId === spanId;
  const color = getStatusColor(status);

  const statusLabel =
    status === "running"
      ? "Running"
      : status === "completed"
        ? "Done"
        : status === "error"
          ? "Error"
          : "Idle";

  return (
    <motion.div
      className="agent-node"
      onClick={() => selectNode(spanId)}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      style={{
        borderColor: isSelected ? color : "rgba(255,255,255,0.08)",
        boxShadow: isSelected
          ? `0 0 20px ${color}33, 0 0 40px ${color}11`
          : status === "error"
            ? `0 0 16px ${color}22`
            : "none",
      }}
    >
      <Handle type="target" position={Position.Top} className="agent-handle" />

      {/* Status indicator dot */}
      <div className="agent-node-header">
        <motion.div
          className="status-dot"
          style={{ backgroundColor: color }}
          animate={
            status === "running"
              ? { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }
              : {}
          }
          transition={
            status === "running"
              ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
              : {}
          }
        />
        <span className="agent-node-label">{label}</span>
      </div>

      <div className="agent-node-meta">
        <span className="status-badge" style={{ color }}>
          {statusLabel}
        </span>
        <span className="event-count">{eventCount} events</span>
      </div>

      <Handle type="source" position={Position.Bottom} className="agent-handle" />
    </motion.div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
