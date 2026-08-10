/**
 * AgentGlass Dashboard — Main Page
 *
 * Three-panel layout:
 *   Left   -> EventTimeline
 *   Center -> AgentGraph (React Flow)
 *   Right  -> NodeInspector (conditional, slide-in)
 */

"use client";

import { useState } from "react";
import TopBar from "../components/TopBar";
import AgentGraph from "../components/AgentGraph";
import EventTimeline from "../components/EventTimeline";
import NodeInspector from "../components/NodeInspector";
import TimeScrubber from "../components/TimeScrubber";
import GodModeDrawer from "../components/GodModeDrawer";

export default function LiveGraphPage() {
  const [godModeOpen, setGodModeOpen] = useState(false);

  return (
    <div className="dashboard" style={{ position: "relative" }}>
      <TopBar />
      <div className="dashboard-body">
        <EventTimeline />
        <main className="dashboard-main dashboard-main-graph">
          <AgentGraph />
        </main>
        <NodeInspector />
      </div>
      <TimeScrubber />
      
      <button
        onClick={() => setGodModeOpen(!godModeOpen)}
        style={{
          position: "absolute",
          bottom: "80px",
          right: "24px",
          backgroundColor: "#ef4444",
          color: "#fff",
          border: "none",
          borderRadius: "50%",
          width: "48px",
          height: "48px",
          fontSize: "1.5rem",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(239, 68, 68, 0.4)",
          zIndex: 90,
          display: "flex",
          justifyContent: "center",
          alignItems: "center"
        }}
        title="Toggle God Mode"
      >
        ⚡
      </button>

      <GodModeDrawer isOpen={godModeOpen} onClose={() => setGodModeOpen(false)} />
    </div>
  );
}