/**
 * AgentGraph — React Flow canvas for the agent topology
 *
 * Derives nodes and edges from the event stream, applies dagre
 * layout, and renders with custom AgentNode components.
 */

"use client";

import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { AgentNode, type AgentNodeData } from "./AgentNode";
import { useSelectedTraceEvents } from "../hooks/useTraceStore";
import { deriveNodesFromEvents, deriveEdgesFromEvents } from "../lib/eventHelpers";
import { computeLayout } from "../lib/graphLayout";

/* ------------------------------------------------------------------ */
/*  Node type registry                                                */
/* ------------------------------------------------------------------ */

const nodeTypes: NodeTypes = {
  agent: AgentNode,
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function AgentGraph() {
  const events = useSelectedTraceEvents();

  const { flowNodes, flowEdges } = useMemo(() => {
    if (events.length === 0) {
      return { flowNodes: [], flowEdges: [] };
    }

    const graphNodes = deriveNodesFromEvents(events);
    const graphEdges = deriveEdgesFromEvents(events);
    const positions = computeLayout(graphNodes, graphEdges, "TB");

    const flowNodes: Node[] = [];

    for (const [spanId, node] of graphNodes) {
      const pos = positions.get(spanId) ?? { x: 0, y: 0 };

      flowNodes.push({
        id: spanId,
        type: "agent",
        position: pos,
        data: {
          label: node.nodeName,
          status: node.status,
          eventCount: node.eventCount,
          spanId: node.spanId,
        } satisfies AgentNodeData,
      });
    }

    const flowEdges: Edge[] = graphEdges
      .filter(
        (e) => graphNodes.has(e.source) && graphNodes.has(e.target)
      )
      .map((e, i) => ({
        id: `edge-${i}`,
        source: e.source,
        target: e.target,
        animated: true,
        style: { stroke: "#7cd8be", strokeWidth: 2, opacity: 0.6 },
      }));

    return { flowNodes, flowEdges };
  }, [events]);

  const onInit = useCallback(() => {
    // React Flow initialized
  }, []);

  if (events.length === 0) {
    return (
      <div className="graph-empty">
        <div className="graph-empty-content">
          <div className="graph-empty-icon">◇</div>
          <h2>Waiting for agent events…</h2>
          <p>
            Start your agent script with AgentGlass instrumentation.
            <br />
            Events will appear here in real time.
          </p>
          <code>
            pip install agentglass-python
            <br />
            # then instrument your LangGraph / agent code
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-container">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onInit={onInit}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(124, 216, 190, 0.08)"
        />
        <Controls
          showInteractive={false}
          className="graph-controls"
        />
      </ReactFlow>
    </div>
  );
}
