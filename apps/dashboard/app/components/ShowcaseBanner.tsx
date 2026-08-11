"use client";

import Link from "next/link";
import { isShowcaseMode } from "../lib/showcaseMode";

export default function ShowcaseBanner() {
  if (!isShowcaseMode()) {
    return null;
  }

  return (
    <div
      className="showcase-banner"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
        padding: "10px 16px",
        background: "linear-gradient(90deg, rgba(59,130,246,0.15), rgba(16,185,129,0.12))",
        borderBottom: "1px solid rgba(96,165,250,0.25)",
        color: "#cbd5e1",
        fontSize: "0.875rem",
      }}
    >
      <span>
        <strong style={{ color: "#93c5fd" }}>Interactive showcase</strong> — real traces from LangGraph
        demos. Clone the repo to run live agents locally.
      </span>
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <Link href="/compare" style={{ color: "#6ee7b7", textDecoration: "none" }}>
          Compare success vs blocked →
        </Link>
        <a
          href="https://github.com/VishalPainjane/AgentGlass"
          target="_blank"
          rel="noreferrer"
          style={{ color: "#94a3b8", textDecoration: "none" }}
        >
          GitHub
        </a>
      </div>
    </div>
  );
}
