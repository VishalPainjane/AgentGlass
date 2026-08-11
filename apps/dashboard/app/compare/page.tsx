"use client";

import { useEffect } from "react";
import TopBar from "../components/TopBar";
import TraceComparePanel from "../components/TraceComparePanel";
import ShowcaseBanner from "../components/ShowcaseBanner";
import { isShowcaseMode } from "../lib/showcaseMode";
import { getShowcaseManifest } from "../lib/showcaseData";
import { useTraceStore } from "../hooks/useTraceStore";

export default function ComparePage() {
  const selectTrace = useTraceStore((s) => s.selectTrace);
  const setCompareTraceId = useTraceStore((s) => s.setCompareTraceId);

  useEffect(() => {
    if (!isShowcaseMode()) return;

    void getShowcaseManifest().then((manifest) => {
      const left = manifest.compare
        ? manifest.traces.find((t) => t.id === manifest.compare!.left)
        : undefined;
      const right = manifest.compare
        ? manifest.traces.find((t) => t.id === manifest.compare!.right)
        : undefined;

      if (left) selectTrace(left.trace_id);
      if (right) setCompareTraceId(right.trace_id);
    });
  }, [selectTrace, setCompareTraceId]);

  return (
    <div className="dashboard">
      <ShowcaseBanner />
      <TopBar mode="compare" />
      <div className="dashboard-body" style={{ position: "relative" }}>
        <TraceComparePanel />
      </div>
    </div>
  );
}
