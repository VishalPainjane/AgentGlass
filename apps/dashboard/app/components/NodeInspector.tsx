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
import { useTraceStore, useSelectedNodeEvents, useSelectedTraceEvents } from "../hooks/useTraceStore";
import {
  getStatusColor,
  getEventTypeColor,
  formatTimestamp,
  deriveNodesFromEvents,
} from "../lib/eventHelpers";
import { daemonHttp } from "../lib/daemonApi";
import RAGXRayPanel from "./RAGXRayPanel";
import { useHydratedPayload } from "../hooks/useHydratedPayload";
import { useHasMounted } from "../hooks/useHasMounted";

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

type InspectorTab = "input" | "output" | "events" | "analysis" | "xray";

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
  const hasMounted = useHasMounted();

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
    const toolResultEvent = node.events.find((e) => e.event_type === "tool_result");
    return errorEvent?.payload ?? endEvent?.payload ?? toolResultEvent?.payload ?? null;
  }, [node]);

  const isCacheHit = useMemo(() => {
    if (!node) return false;
    return node.events.some(
      (e) => e.payload && typeof e.payload === "object" && (e.payload as any).cache_hit === true
    );
  }, [node]);

  const { hydrated: hydratedInput, isLoadingBlob: loadingInput } = useHydratedPayload(inputPayload);
  const { hydrated: hydratedOutput, isLoadingBlob: loadingOutput } = useHydratedPayload(outputPayload);

  const retrievalResults = useMemo(() => {
    if (hydratedOutput?.retrieval_results) return hydratedOutput.retrieval_results;
    if (hydratedOutput?.result?.retrieval_results) return hydratedOutput.result.retrieval_results;
    if (hydratedOutput?.output?.retrieval_results) return hydratedOutput.output.retrieval_results;
    return null;
  }, [hydratedOutput]);

  const queryForRag = useMemo(() => {
    if (hydratedInput?.query) return hydratedInput.query;
    if (hydratedInput?.inputs?.query) return hydratedInput.inputs.query;
    if (hydratedInput?.term) return hydratedInput.term;
    return undefined;
  }, [hydratedInput]);

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
      
      const res = await fetch(daemonHttp("/v1/commands"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trace_id: traceId,
          target_span: node.spanId,
          command_type: "inject",
          payload: parsedPayload,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to inject state command");
      }
      alert("State injection command sent to daemon.");
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
            {retrievalResults && (
              <button
                key="xray"
                className={`inspector-tab ${activeTab === "xray" ? "inspector-tab-active" : ""}`}
                onClick={() => setActiveTab("xray")}
                style={{ color: "#60a5fa" }}
                title="View RAG retrieval context visually"
              >
                🔍 RAG X-Ray
              </button>
            )}
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

          {/* Monaco Editor or RCA View */}
          <div className="inspector-editor" style={{ overflowY: "auto" }}>
            {activeTab === "xray" && retrievalResults ? (
              <RAGXRayPanel results={retrievalResults} query={queryForRag} />
            ) : activeTab === "analysis" ? (
              <div style={{ padding: "16px", color: "var(--foreground)", fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column", gap: "12px" }}>
                {isAnalyzing ? (
                  <div style={{ color: "#a855f7" }}>✨ Analyzing root cause locally...</div>
                ) : analysisContent?.error ? (
                  <div style={{ color: "#f87171" }}>{analysisContent.error}</div>
                ) : analysisContent ? (
                  <>
                    <div>
                      <h4 style={{ color: "#f87171", margin: "0 0 4px 0" }}>Root Cause</h4>
                      <p style={{ margin: 0, fontSize: "0.95rem" }}>{analysisContent.rootCause}</p>
                    </div>
                    <div>
                      <h4 style={{ color: "#a855f7", margin: "0 0 4px 0" }}>Explanation</h4>
                      <p style={{ margin: 0, fontSize: "0.95rem", whiteSpace: "pre-wrap" }}>{analysisContent.explanation}</p>
                    </div>
                    <div>
                      <h4 style={{ color: "#4ade80", margin: "0 0 4px 0" }}>Suggested Fix</h4>
                      <p style={{ margin: 0, fontSize: "0.95rem", whiteSpace: "pre-wrap" }}>{analysisContent.suggestedFix}</p>
                    </div>
                    {analysisContent.origin_span_id && (
                      <button 
                        onClick={() => selectNode(analysisContent.origin_span_id)}
                        style={{ marginTop: "8px", alignSelf: "flex-start", padding: "8px 16px", backgroundColor: "rgba(59, 130, 246, 0.2)", color: "#60a5fa", borderRadius: "6px", cursor: "pointer", border: "1px solid #3b82f6" }}
                      >
                        ↗ Jump to Origin Node
                      </button>
                    )}
                    <div style={{ marginTop: "8px", fontSize: "0.8rem", opacity: 0.6 }}>
                      Model: {analysisContent.model} • Confidence: {(analysisContent.confidence * 100).toFixed(0)}%
                    </div>
                  </>
                ) : (
                  <div>No analysis available. Click "Auto-Analyze" above.</div>
                )}
              </div>
            ) : (
              <MonacoEditor
                height="100%"
                language="json"
                theme="vs-dark"
                value={editedContent}
                onChange={(val) => setEditedContent(val ?? "")}
                options={{
                  readOnly: activeTab === "events",
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
            )}
          </div>

          {/* Action Row */}
          {activeTab !== "events" && activeTab !== "analysis" && activeTab !== "xray" && (
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
                  {hasMounted ? formatTimestamp(event.timestamp) : "…"}
                </span>
              </div>
            ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
