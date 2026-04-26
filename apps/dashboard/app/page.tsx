/**
 * AgentGlass Dashboard — Main Page
 *
 * Three-panel layout:
 *   Left   → EventTimeline
 *   Center → AgentGraph (React Flow)
 *   Right  → NodeInspector (conditional, slide-in)
 */

"use client";

import TopBar from "./components/TopBar";
import AgentGraph from "./components/AgentGraph";
import EventTimeline from "./components/EventTimeline";
import NodeInspector from "./components/NodeInspector";
import TimeScrubber from "./components/TimeScrubber";
import { useDaemonSocket } from "./hooks/useDaemonSocket";

export default function HomePage() {
  // Connect to the daemon WebSocket
  useDaemonSocket();

  return (
    <div className="dashboard">
      <TopBar />
      <div className="dashboard-body">
        <EventTimeline />
        <main className="dashboard-main">
          <AgentGraph />
        </main>
        <NodeInspector />
      </div>
      <TimeScrubber />
    </div>
  );
}
