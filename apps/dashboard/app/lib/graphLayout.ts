/**
 * Graph Layout — Dagre-based auto positioning for React Flow
 */

import dagre from "dagre";
import type { GraphNode, GraphEdge } from "./eventHelpers";

export interface LayoutNode {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;

export function computeLayout(
  nodes: Map<string, GraphNode>,
  edges: GraphEdge[],
  direction: "TB" | "LR" = "TB"
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();

  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 80,
    marginx: 40,
    marginy: 40,
  });

  g.setDefaultEdgeLabel(() => ({}));

  for (const [spanId] of nodes) {
    g.setNode(spanId, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of edges) {
    // Only add edge if both nodes exist
    if (nodes.has(edge.source) && nodes.has(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();

  for (const [spanId] of nodes) {
    const node = g.node(spanId);
    if (node) {
      positions.set(spanId, {
        x: node.x - NODE_WIDTH / 2,
        y: node.y - NODE_HEIGHT / 2,
      });
    }
  }

  return positions;
}

export { NODE_WIDTH, NODE_HEIGHT };
