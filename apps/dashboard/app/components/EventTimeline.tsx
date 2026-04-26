/**
 * EventTimeline — Chronological sidebar of all events
 *
 * Displays each event as a compact card with color-coded
 * type badge, timestamp, and node name.  Clicking highlights
 * the corresponding node in the graph.
 */

"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTraceStore, useSelectedTraceEvents } from "../hooks/useTraceStore";
import {
  formatTimestamp,
  getEventTypeColor,
} from "../lib/eventHelpers";

/* ------------------------------------------------------------------ */
/*  Event type → short label                                          */
/* ------------------------------------------------------------------ */

function eventLabel(eventType: string): string {
  switch (eventType) {
    case "agent_start":
      return "START";
    case "agent_end":
      return "END";
    case "tool_call":
      return "TOOL";
    case "tool_result":
      return "RESULT";
    case "llm_request":
      return "LLM →";
    case "llm_response":
      return "LLM ←";
    case "llm_stream":
      return "STREAM";
    case "state_snapshot":
      return "STATE";
    case "error":
      return "ERROR";
    default:
      return eventType.toUpperCase().slice(0, 6);
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function EventTimeline() {
  const events = useSelectedTraceEvents();
  const selectedSpanId = useTraceStore((s) => s.selectedSpanId);
  const selectNode = useTraceStore((s) => s.selectNode);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  if (events.length === 0) {
    return (
      <aside className="timeline-panel">
        <div className="timeline-header">
          <h3>Event Timeline</h3>
          <span className="timeline-count">0</span>
        </div>
        <div className="timeline-empty">
          <p>No events yet</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="timeline-panel">
      <div className="timeline-header">
        <h3>Event Timeline</h3>
        <span className="timeline-count">{events.length}</span>
      </div>

      <div className="timeline-scroll" ref={scrollRef}>
        <AnimatePresence initial={false}>
          {events.map((event, index) => {
            const color = getEventTypeColor(event.event_type);
            const isSelected = event.span_id === selectedSpanId;
            const name =
              event.node_name ||
              (event.payload as Record<string, unknown>)?.name ||
              event.span_id.slice(0, 8);

            return (
              <motion.div
                key={`${event.ingest_id}-${index}`}
                className={`timeline-event ${isSelected ? "timeline-event-selected" : ""}`}
                onClick={() => selectNode(event.span_id)}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  borderLeftColor: color,
                }}
              >
                <div className="timeline-event-top">
                  <span
                    className="event-type-badge"
                    style={{ backgroundColor: `${color}22`, color }}
                  >
                    {eventLabel(event.event_type)}
                  </span>
                  <span className="timeline-time">
                    {formatTimestamp(event.timestamp)}
                  </span>
                </div>
                <div className="timeline-event-name">{String(name)}</div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </aside>
  );
}
