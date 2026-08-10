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
import GraphTraceOverlay from "./GraphTraceOverlay";
import { useTraceStore, useSelectedTraceEvents } from "../hooks/useTraceStore";
import { deriveNodesFromEvents, deriveEdgesFromEvents, canonicalNodeDisplayName } from "../lib/eventHelpers";
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
  const isFetching = useTraceStore((s) => s.isFetching);
  const connectionStatus = useTraceStore((s) => s.connectionStatus);

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
          label: canonicalNodeDisplayName(node.nodeName),
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

  if (isFetching && events.length === 0) {
    return (
      <div className="graph-empty">
        <div className="graph-empty-content">
          <div className="graph-loading-spinner" />
          <h2>Loading trace events…</h2>
          <p>Fetching full event history from the daemon.</p>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="graph-empty">
        <div className="graph-empty-content">
          <div className="graph-empty-icon">◇</div>
          <h2>No traces yet</h2>
          {connectionStatus === "disconnected" ? (
            <p>
              Daemon is not connected. Start AgentGlass from the repository root, then run the
              LangGraph demo.
            </p>
          ) : connectionStatus === "connecting" ? (
            <p>Connecting to the AgentGlass daemon…</p>
          ) : (
            <p>
              Daemon is connected. Run the canonical LangGraph demo to generate a real trace.
            </p>
          )}
          <div style={{ display: "flex", gap: "12px", marginTop: "16px", flexDirection: "column", alignItems: "center" }}>
            <code style={{ textAlign: "left", whiteSpace: "pre-wrap" }}>
              {`pnpm demo -- --compare\n\n# or, if services are already running:\ncd sdk-python\npython examples/demo_support_research_agent.py`}
            </code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-container">
      <GraphTraceOverlay />
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onInit={onInit}
        onNodeClick={(_event, node) => {
          const spanId = (node.data as AgentNodeData).spanId;
          if (spanId) {
            useTraceStore.getState().selectNode(spanId);
          }
        }}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        style={{ width: "100%", height: "100%" }}
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
