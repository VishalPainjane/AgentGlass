/**
 * Cache Manager v1 — VCR cache inspection and management
 *
 * Phase 1 implementation:
 * - Shows cached LLM responses extracted from trace events (tool_result, llm_response)
 * - Search and filter by model/provider
 * - Clear empty state with CLI guidance when no cache data
 * - Detail panel showing cached payloads
 */

"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import TopBar from "../components/TopBar";
import { useTraceStore } from "../hooks/useTraceStore";
import { formatTimestamp, type PersistedEvent } from "../lib/eventHelpers";
import { daemonHttp } from "../lib/daemonApi";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  id: string;
  model: string;
  provider: string;
  eventType: string;
  nodeName: string;
  traceId: string;
  shortTraceId: string;
  timestamp: number;
  timestampLabel: string;
  payloadSize: number;
  payloadSizeLabel: string;
  payload: Record<string, unknown>;
  status: "cached" | "replayed" | "expired";
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extractCacheEntries(events: PersistedEvent[]): CacheEntry[] {
  const cacheableTypes = new Set(["llm_response", "tool_result", "llm_request"]);

  return events
    .filter((e) => cacheableTypes.has(e.event_type))
    .map((e) => {
      const payload = e.payload || {};
      const payloadStr = JSON.stringify(payload);
      const model = (payload.model as string) || "unknown";
      const provider = inferProvider(model);
      const isCacheHit =
        payload.cache_hit === true ||
        payload.cached === true ||
        (payload.source as string)?.toLowerCase() === "cache";

      return {
        id: e.ingest_id || e.span_id + "-" + e.timestamp,
        model,
        provider,
        eventType: e.event_type,
        nodeName: e.node_name || "Unknown",
        traceId: e.trace_id,
        shortTraceId: e.trace_id.slice(0, 8),
        timestamp: e.timestamp,
        timestampLabel: formatTimestamp(e.timestamp),
        payloadSize: payloadStr.length,
        payloadSizeLabel: formatBytes(payloadStr.length),
        payload,
        status: (isCacheHit ? "replayed" : "cached") as CacheEntry["status"],
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

function inferProvider(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("gpt") || m.includes("o1") || m.includes("o3") || m.includes("openai")) return "OpenAI";
  if (m.includes("claude") || m.includes("anthropic")) return "Anthropic";
  if (m.includes("gemini") || m.includes("google")) return "Google";
  if (m.includes("llama") || m.includes("mixtral") || m.includes("mistral")) return "Open Source";
  if (m.includes("cohere")) return "Cohere";
  return "Unknown";
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function CachePage() {
  const storeEvents = useTraceStore((s) => s.events);
  const [historicalEvents, setHistoricalEvents] = useState<PersistedEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedEntry, setSelectedEntry] = useState<CacheEntry | null>(null);

  // Combine store events with historical ones for a complete view
  const events = useMemo(() => {
    const combined = [...storeEvents, ...historicalEvents];
    const seen = new Set<string>();
    return combined.filter(e => {
      const id = e.ingest_id || `${e.span_id}-${e.timestamp}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [storeEvents, historicalEvents]);

  useEffect(() => {
    async function fetchCache() {
      try {
        const res = await fetch(daemonHttp("/v1/cache"));
        if (res.ok) {
          const data = await res.json();
          setHistoricalEvents(data.events || []);
        }
      } catch (err) {
        console.error("Failed to fetch historical cache", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchCache();
  }, []);

  const cacheEntries = useMemo(() => extractCacheEntries(events), [events]);

  const providers = useMemo(() => {
    const set = new Set(cacheEntries.map((e) => e.provider));
    return Array.from(set).sort();
  }, [cacheEntries]);

  const filteredEntries = useMemo(() => {
    let result = cacheEntries;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.model.toLowerCase().includes(q) ||
          e.nodeName.toLowerCase().includes(q) ||
          e.shortTraceId.toLowerCase().includes(q) ||
          e.provider.toLowerCase().includes(q)
      );
    }

    if (filterProvider !== "all") {
      result = result.filter((e) => e.provider === filterProvider);
    }

    if (filterType !== "all") {
      result = result.filter((e) => e.eventType === filterType);
    }

    return result;
  }, [cacheEntries, searchQuery, filterProvider, filterType]);

  const handleClearSelection = useCallback(() => {
    setSelectedEntry(null);
  }, []);

  // Empty state when no cache entries exist
  if (cacheEntries.length === 0) {
    return (
      <div className="dashboard">
        <TopBar />
        <div className="dashboard-body cache-page-body">
          <div className="cache-empty-state">
            <div className="cache-empty-icon">⚡</div>
            <h2>VCR Cache Manager</h2>
            <p>
              The AgentGlass VCR intercepts LLM API calls and caches responses
              deterministically for replay, testing, and cost savings.
            </p>

            <div className="cache-empty-steps">
              <h3>Getting Started</h3>
              <div className="cache-step">
                <span className="cache-step-num">1</span>
                <div>
                  <strong>Enable VCR in your agent</strong>
                  <code>from agentglass_python import enable_vcr{"\n"}enable_vcr()</code>
                </div>
              </div>
              <div className="cache-step">
                <span className="cache-step-num">2</span>
                <div>
                  <strong>Run your agent</strong>
                  <code>python my_agent.py</code>
                </div>
              </div>
              <div className="cache-step">
                <span className="cache-step-num">3</span>
                <div>
                  <strong>View cached responses here</strong>
                  <p>LLM responses and tool results will appear in this view.</p>
                </div>
              </div>
            </div>

            <div className="cache-empty-cli">
              <h3>CLI Commands</h3>
              <div className="cache-cli-cmd">
                <code>agentglass cache list</code>
                <span>List all cached entries</span>
              </div>
              <div className="cache-cli-cmd">
                <code>agentglass cache clear</code>
                <span>Wipe the entire cache</span>
              </div>
              <div className="cache-cli-cmd">
                <code>agentglass cache stats</code>
                <span>Show cache hit/miss statistics</span>
              </div>
            </div>

            <p className="cache-empty-note">
              No cached data detected. Run an instrumented agent with VCR enabled, or
              connect to a running daemon to see cache entries.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <TopBar />
      <div className="dashboard-body cache-page-body">
        <div className="cache-page">
          {/* Header */}
          <div className="cache-header">
            <div>
              <h1 className="cache-title">VCR Cache Manager</h1>
              <p className="cache-subtitle">
                {cacheEntries.length} cached responses • {providers.join(", ")}
              </p>
            </div>
            <div className="cache-header-actions">
              <span className="cache-stat-pill">
                {filteredEntries.length} / {cacheEntries.length} shown
              </span>
            </div>
          </div>

          {/* Filters */}
          <div className="cache-filters">
            <input
              type="text"
              className="cache-search"
              placeholder="Search by model, node, trace ID…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              id="cache-search-input"
            />
            <select
              className="cache-filter-select"
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              id="cache-filter-provider"
            >
              <option value="all">All Providers</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              className="cache-filter-select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              id="cache-filter-type"
            >
              <option value="all">All Types</option>
              <option value="llm_response">LLM Response</option>
              <option value="llm_request">LLM Request</option>
              <option value="tool_result">Tool Result</option>
            </select>
          </div>

          {/* Content */}
          <div className="cache-content">
            {/* List */}
            <div className="cache-list">
              {filteredEntries.length === 0 ? (
                <div className="cache-no-results">No matching cache entries</div>
              ) : (
                filteredEntries.slice(0, 200).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`cache-item ${selectedEntry?.id === entry.id ? "cache-item-selected" : ""}`}
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <div className="cache-item-top">
                      <span className="cache-item-model">{entry.model}</span>
                      <span className={`cache-item-status cache-item-status-${entry.status}`}>
                        {entry.status}
                      </span>
                    </div>
                    <div className="cache-item-meta">
                      <span className="cache-item-type">{entry.eventType}</span>
                      <span>•</span>
                      <span>{entry.nodeName}</span>
                      <span>•</span>
                      <span>{entry.payloadSizeLabel}</span>
                    </div>
                    <div className="cache-item-bottom">
                      <span className="cache-item-trace">{entry.shortTraceId}</span>
                      <span className="cache-item-time">{entry.timestampLabel}</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Detail Panel */}
            <div className="cache-detail">
              {selectedEntry ? (
                <>
                  <div className="cache-detail-header">
                    <h3>{selectedEntry.model}</h3>
                    <button
                      type="button"
                      className="cache-detail-close"
                      onClick={handleClearSelection}
                      aria-label="Close detail"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="cache-detail-grid">
                    <div className="cache-detail-row">
                      <span>Provider</span>
                      <strong>{selectedEntry.provider}</strong>
                    </div>
                    <div className="cache-detail-row">
                      <span>Event Type</span>
                      <strong>{selectedEntry.eventType}</strong>
                    </div>
                    <div className="cache-detail-row">
                      <span>Node</span>
                      <strong>{selectedEntry.nodeName}</strong>
                    </div>
                    <div className="cache-detail-row">
                      <span>Trace</span>
                      <strong>{selectedEntry.shortTraceId}</strong>
                    </div>
                    <div className="cache-detail-row">
                      <span>Time</span>
                      <strong>{selectedEntry.timestampLabel}</strong>
                    </div>
                    <div className="cache-detail-row">
                      <span>Size</span>
                      <strong>{selectedEntry.payloadSizeLabel}</strong>
                    </div>
                    <div className="cache-detail-row">
                      <span>Status</span>
                      <strong
                        className={`cache-item-status cache-item-status-${selectedEntry.status}`}
                      >
                        {selectedEntry.status}
                      </strong>
                    </div>
                  </div>

                  <div className="cache-detail-payload">
                    <h4>Payload</h4>
                    <pre className="cache-detail-json">
                      {JSON.stringify(selectedEntry.payload, null, 2)}
                    </pre>
                  </div>
                </>
              ) : (
                <div className="cache-detail-empty">
                  <p>Select a cache entry to inspect its payload.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
