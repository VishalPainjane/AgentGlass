"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface RetrievalResult {
  text: string;
  score: number;
  source?: string;
  metadata?: Record<string, any>;
}

interface RAGXRayPanelProps {
  results: RetrievalResult[];
  query?: string;
}

export default function RAGXRayPanel({ results, query }: RAGXRayPanelProps) {
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      return sortOrder === "desc" ? b.score - a.score : a.score - b.score;
    });
  }, [results, sortOrder]);

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return "#4ade80"; // Green
    if (score >= 0.6) return "#facc15"; // Yellow
    return "#f87171"; // Red
  };

  return (
    <div className="rag-xray-panel" style={{ padding: "16px", color: "var(--foreground)", fontFamily: "var(--font-sans)", height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ margin: 0, fontSize: "1.1rem" }}>RAG X-Ray</h3>
        <button 
          onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}
          style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "var(--foreground)", padding: "4px 8px", borderRadius: "4px", cursor: "pointer", fontSize: "0.85rem" }}
        >
          Sort by Score: {sortOrder === "desc" ? "Highest First" : "Lowest First"}
        </button>
      </div>

      {query && (
        <div style={{ marginBottom: "16px", padding: "12px", background: "rgba(255,255,255,0.05)", borderRadius: "8px", borderLeft: "3px solid #60a5fa" }}>
          <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginBottom: "4px" }}>Query</div>
          <div style={{ fontSize: "0.95rem" }}>{query}</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <AnimatePresence>
          {sortedResults.map((result, idx) => {
            const isExpanded = expandedIndex === idx;
            return (
              <motion.div 
                key={idx}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{ 
                  background: "var(--surface)", 
                  border: "1px solid var(--border)", 
                  borderRadius: "8px", 
                  overflow: "hidden",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"
                }}
              >
                <div 
                  onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                  style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px", background: isExpanded ? "rgba(255,255,255,0.03)" : "transparent" }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#e5e7eb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {result.source || `Chunk #${idx + 1}`}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginTop: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {result.text.slice(0, 80)}...
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", width: "60px" }}>
                    <div style={{ fontSize: "1rem", fontWeight: "bold", color: getScoreColor(result.score) }}>
                      {result.score.toFixed(2)}
                    </div>
                    <div style={{ width: "100%", height: "4px", background: "rgba(255,255,255,0.1)", borderRadius: "2px", marginTop: "4px", overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, result.score * 100))}%`, height: "100%", background: getScoreColor(result.score) }} />
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div style={{ padding: "16px", borderTop: "1px solid var(--border)", fontSize: "0.9rem", lineHeight: 1.5, color: "#d1d5db" }}>
                        <div style={{ whiteSpace: "pre-wrap", marginBottom: result.metadata ? "16px" : 0 }}>
                          {result.text}
                        </div>
                        {result.metadata && Object.keys(result.metadata).length > 0 && (
                          <div style={{ background: "rgba(0,0,0,0.2)", padding: "8px", borderRadius: "4px", fontSize: "0.8rem" }}>
                            <div style={{ color: "#9ca3af", marginBottom: "4px", fontWeight: "bold" }}>Metadata</div>
                            <pre style={{ margin: 0, color: "#a78bfa" }}>{JSON.stringify(result.metadata, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}