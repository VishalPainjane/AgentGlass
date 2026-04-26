/**
 * NodeInspector — Sliding panel with Monaco Editor for payload inspection
 *
 * Opens when a node is selected in the graph.  Shows the node's
 * input/output payloads, all events, and status metadata in a
 * syntax-highlighted JSON viewer.
 */

"use client";

import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { useTraceStore, useSelectedNodeEvents } from "../hooks/useTraceStore";
import {
  getStatusColor,
  getEventTypeColor,
  formatTimestamp,
  deriveNodesFromEvents,
} from "../lib/eventHelpers";
import { useSelectedTraceEvents } from "../hooks/useTraceStore";
import { daemonHttp } from "../lib/daemonApi";

// Lazy load Monaco to avoid SSR issues
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="monaco-loading">Loading editor…</div>
  ),
});

/* ------------------------------------------------------------------ */
/*  Tabs                                                              */
/* ------------------------------------------------------------------ */

type InspectorTab = "input" | "output" | "events" | "analysis";

/* ------------------------------------------------------------------ */
/*  Blob Hydration                                                    */
/* ------------------------------------------------------------------ */

function isBlobRef(payload: any): payload is { $blob: string } {
  return payload && typeof payload === "object" && typeof payload.$blob === "string";
}

export function useHydratedPayload(payload: any) {
  const [hydrated, setHydrated] = useState<any>(payload);
  const [isLoadingBlob, setIsLoadingBlob] = useState(false);

  useEffect(() => {
    if (isBlobRef(payload)) {
      setIsLoadingBlob(true);
      fetch(daemonHttp(`/v1/blobs/${payload.$blob}`))
        .then(res => res.json())
        .then(data => setHydrated(data))
        .catch(err => {
          console.error("Failed to load blob", err);
          setHydrated({ $error: "Failed to load blob", hash: payload.$blob });
        })
        .finally(() => setIsLoadingBlob(false));
    } else {
      setHydrated(payload);
    }
  }, [payload]);

  return { hydrated, isLoadingBlob };
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function NodeInspector() {
  const selectedSpanId = useTraceStore((s) => s.selectedSpanId);
  const selectNode = useTraceStore((s) => s.selectNode);
  const nodeEvents = useSelectedNodeEvents();
  const allTraceEvents = useSelectedTraceEvents();
  const [activeTab, setActiveTab] = useState<InspectorTab>("input");
  const [editedContent, setEditedContent] = useState<string>("");
  const [isInjecting, setIsInjecting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisContent, setAnalysisContent] = useState<any>(null);

  const node = useMemo(() => {
    if (!selectedSpanId || allTraceEvents.length === 0) return null;
    const nodes = deriveNodesFromEvents(allTraceEvents);
    return nodes.get(selectedSpanId) ?? null;
  }, [selectedSpanId, allTraceEvents]);

  const inputPayload = useMemo(() => {
    if (!node) return null;
    const startEvent = node.events.find((e) => e.event_type === "agent_start");
    return startEvent?.payload ?? null;
  }, [node]);

  const outputPayload = useMemo(() => {
    if (!node) return null;
    const errorEvent = node.events.find((e) => e.event_type === "error");
    const endEvent = node.events.find((e) => e.event_type === "agent_end");
    return errorEvent?.payload ?? endEvent?.payload ?? null;
  }, [node]);

  const isCacheHit = useMemo(() => {
    if (!node) return false;
    return node.events.some(
      (e) => e.payload && typeof e.payload === "object" && (e.payload as any).cache_hit === true
    );
  }, [node]);

  const { hydrated: hydratedInput, isLoadingBlob: loadingInput } = useHydratedPayload(inputPayload);
  const { hydrated: hydratedOutput, isLoadingBlob: loadingOutput } = useHydratedPayload(outputPayload);

  const defaultEditorContent = useMemo(() => {
    if (activeTab === "input") {
      if (loadingInput) return "Loading payload from blob store...";
      return JSON.stringify(hydratedInput, null, 2) ?? "null";
    }
    if (activeTab === "output") {
      if (loadingOutput) return "Loading payload from blob store...";
      return JSON.stringify(hydratedOutput, null, 2) ?? "null";
    }
    // "events" tab - show all events for this node (raw, unhydrated blobs)
    if (activeTab === "events") {
      return JSON.stringify(nodeEvents, null, 2);
    }
    // "analysis" tab
    if (activeTab === "analysis") {
      return isAnalyzing ? "Analyzing root cause locally..." : JSON.stringify(analysisContent, null, 2) || "No analysis available.";
    }
    return "";
  }, [activeTab, hydratedInput, loadingInput, hydratedOutput, loadingOutput, nodeEvents, isAnalyzing, analysisContent]);

  // Sync edited content when tab or node changes
  useEffect(() => {
    setEditedContent(defaultEditorContent);
  }, [defaultEditorContent]);

  const handleInjectState = async () => {
    if (!node || !selectedSpanId) return;
    try {
      setIsInjecting(true);
      const parsedPayload = JSON.parse(editedContent);
      const traceId = useTraceStore.getState().selectedTraceId || nodeEvents[0]?.trace_id;
      
      const injectEvent = {
        trace_id: traceId,
        span_id: node.spanId,
        parent_span_id: node.parentSpanId,
        event_type: "state_injection",
        node_name: node.nodeName,
        payload: parsedPayload,
      };

      const res = await fetch(daemonHttp("/v1/events"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(injectEvent),
      });

      if (!res.ok) {
        throw new Error("Failed to inject state");
      }
    } catch (e) {
      console.error(e);
      alert("Invalid JSON or network error during injection.");
    } finally {
      setIsInjecting(false);
    }
  };

  const handleAnalyzeError = async () => {
    if (!node || !selectedSpanId) return;
    try {
      setIsAnalyzing(true);
      setActiveTab("analysis");
      const traceId = useTraceStore.getState().selectedTraceId || nodeEvents[0]?.trace_id;
      const res = await fetch(daemonHttp(`/v1/traces/${traceId}/spans/${node.spanId}/analyze`));
      if (!res.ok) throw new Error("Analysis failed");
      const data = await res.json();
      setAnalysisContent(data);
    } catch (e) {
      console.error(e);
      setAnalysisContent({ error: "Failed to reach local daemon or Ollama engine." });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <AnimatePresence>
      {node && (
        <motion.aside
          className="inspector-panel"
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {/* Header */}
          <div className="inspector-header">
            <div className="inspector-title-row">
              <div
                className="inspector-status-dot"
                style={{ backgroundColor: getStatusColor(node.status) }}
              />
              <h3 className="inspector-title">{node.nodeName}</h3>
              <button
                className="inspector-close"
                onClick={() => selectNode(null)}
                aria-label="Close inspector"
              >
                ✕
              </button>
            </div>
            <div className="inspector-meta">
              <span className="inspector-span-id">
                {node.spanId.slice(0, 12)}…
              </span>
              <span
                className="inspector-status-badge"
                style={{ color: getStatusColor(node.status) }}
              >
                {node.status}
              </span>
              {isCacheHit && (
                <span className="inspector-status-badge" style={{ color: "#4ade80", borderColor: "#4ade80" }}>
                  CACHE HIT
                </span>
              )}
              <span className="inspector-event-count">
                {node.eventCount} events
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="inspector-tabs">
            {(["input", "output", "events"] as InspectorTab[]).map((tab) => (
              <button
                key={tab}
                className={`inspector-tab ${activeTab === tab ? "inspector-tab-active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "input" ? "Input" : tab === "output" ? "Output" : "All Events"}
              </button>
            ))}
            {node.status === "error" && (
              <button
                key="analysis"
                className={`inspector-tab ${activeTab === "analysis" ? "inspector-tab-active" : ""}`}
                onClick={handleAnalyzeError}
                style={{ color: "#f87171" }}
                title="Use local LLM to analyze this error"
              >
                ✨ Auto-Analyze
              </button>
            )}
          </div>

          {/* Monaco Editor */}
          <div className="inspector-editor">
            <MonacoEditor
              height="100%"
              language="json"
              theme="vs-dark"
              value={editedContent}
              onChange={(val) => setEditedContent(val ?? "")}
              options={{
                readOnly: activeTab === "events" || activeTab === "analysis",
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "var(--font-mono), monospace",
                lineNumbers: "off",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                padding: { top: 12, bottom: 12 },
                renderLineHighlight: "none",
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
                scrollbar: {
                  verticalScrollbarSize: 6,
                  horizontalScrollbarSize: 6,
                },
              }}
            />
          </div>

          {/* Action Row */}
          {activeTab !== "events" && activeTab !== "analysis" && (
            <div className="inspector-actions">
              <button 
                className="btn-inject" 
                onClick={handleInjectState}
                disabled={isInjecting || editedContent === defaultEditorContent}
              >
                {isInjecting ? "Injecting..." : "Inject State"}
              </button>
            </div>
          )}

          {/* Event list at bottom */}
          <div className="inspector-events-list">
            <h4>Event Log</h4>
            {nodeEvents.map((event, i) => (
              <div key={i} className="inspector-event-row">
                <span
                  className="inspector-event-dot"
                  style={{ backgroundColor: getEventTypeColor(event.event_type) }}
                />
                <span className="inspector-event-type">{event.event_type}</span>
                <span className="inspector-event-time">
                  {formatTimestamp(event.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
