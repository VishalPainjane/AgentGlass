"use client";

import TopBar from "../components/TopBar";
import TraceComparePanel from "../components/TraceComparePanel";
import { useDaemonSocket } from "../hooks/useDaemonSocket";

export default function ComparePage() {
  return (
    <div className="dashboard">
      <TopBar mode="compare" />
      <div className="dashboard-body" style={{ position: "relative" }}>
        <TraceComparePanel />
      </div>
    </div>
  );
}
