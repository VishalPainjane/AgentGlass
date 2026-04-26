"use client";

import TopBar from "../components/TopBar";

export default function SettingsPage() {
  return (
    <div className="dashboard">
      <TopBar />
      <div className="dashboard-body" style={{ padding: "40px", flexDirection: "column" }}>
        <h1 style={{ fontSize: "24px", marginBottom: "16px" }}>Settings</h1>
        <p style={{ color: "var(--text-muted)" }}>
          AgentGlass settings and daemon connection preferences will be added here.
        </p>
      </div>
    </div>
  );
}
