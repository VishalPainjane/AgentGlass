"use client";

import TopBar from "../components/TopBar";
import TraceComparePanel from "../components/TraceComparePanel";
import { useDaemonSocket } from "../hooks/useDaemonSocket";

export default function ComparePage() {
  // Connect to the daemon WebSocket
  useDaemonSocket();

  return (
    <div className="dashboard">
      <TopBar mode="compare" />
      <div className="dashboard-body" style={{ position: "relative" }}>
        <TraceComparePanel />
      </div>
    </div>
  );
}
