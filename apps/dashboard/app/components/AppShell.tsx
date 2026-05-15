"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import { useDaemonSocket } from "../hooks/useDaemonSocket";
import { useTraceStore } from "../hooks/useTraceStore";
import { usePersistUI } from "../hooks/usePersistUI";
import { useFocusFirst } from "../hooks/useFocusFirst";
import { CommandPalette } from "./CommandPalette";
import { ToastContainer } from "./ToastContainer";
import { OnlineStatus } from "./OnlineStatus";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMarketingRoute = pathname === "/" || pathname.startsWith("/docs");
  const denseMode = useTraceStore((s) => s.denseMode);

  useDaemonSocket();
  usePersistUI();
  useFocusFirst();

  if (isMarketingRoute) {
    return (
      <>
        {children}
        <CommandPalette />
        <ToastContainer />
      </>
    );
  }

  return (
    <div className={`app-container ${denseMode ? "dense-mode" : ""}`}>
      <Sidebar />
      <main className="main-content">{children}</main>
      <CommandPalette />
      <ToastContainer />
      <OnlineStatus />
    </div>
  );
}


