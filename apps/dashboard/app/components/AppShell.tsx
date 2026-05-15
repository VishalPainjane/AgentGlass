"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import { useDaemonSocket } from "../hooks/useDaemonSocket";
import { useTraceStore } from "../hooks/useTraceStore";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMarketingRoute = pathname === "/" || pathname.startsWith("/docs");
  const denseMode = useTraceStore((s) => s.denseMode);

  // Single connection for the entire dashboard
  useDaemonSocket();

  if (isMarketingRoute) {
    return <>{children}</>;
  }

  return (
    <div className={`app-container ${denseMode ? "dense-mode" : ""}`}>
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}


