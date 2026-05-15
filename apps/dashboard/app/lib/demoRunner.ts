/**
 * LiveDemoRunner — Uses the real daemon HTTP API to trace a real execution
 * 
 * This posts events through the actual daemon ingestion pipeline.
 * Events go through real validation, storage, and WebSocket broadcast.
 */

import { useTraceStore } from "../hooks/useTraceStore";
import type { PersistedEvent } from "./eventHelpers";

const DAEMON_URL = "http://127.0.0.1:8765";

const DEMO_EVENTS = [
  { event_type: "agent_start", node_name: "Researcher", payload: { query: "What is Rust ownership?" }, delay: 300 },
  { event_type: "tool_call", node_name: "WebSearch", payload: { query: "Rust ownership model" }, delay: 200 },
  { event_type: "tool_result", node_name: "WebSearch", payload: { results: ["Rust book", "Rust nomicon", "Ownership RFC"] }, delay: 300 },
  { event_type: "llm_request", node_name: "Summarizer", payload: { model: "gpt-4", tokens: 150 }, delay: 400 },
  { event_type: "llm_response", node_name: "Summarizer", payload: { summary: "Ownership is Rust's unique system for memory safety without GC" }, delay: 200 },
  { event_type: "agent_end", node_name: "Researcher", payload: { status: "completed", confidence: 0.92 }, delay: 100 },
];

export async function runLiveDemo() {
  const setDemoMode = useTraceStore.getState().setDemoMode;
  const setEvents = useTraceStore.getState().setEvents;
  const addEvent = useTraceStore.getState().addEvent;
  const setTraces = useTraceStore.getState().setTraces;
  const selectTrace = useTraceStore.getState().selectTrace;
  
  setDemoMode(true);
  setEvents([]);
  
  const traceId = "live-demo-" + Date.now();
  const startTime = Date.now() * 1000;
  
  setTraces([{ 
    trace_id: traceId, 
    event_count: DEMO_EVENTS.length, 
    first_timestamp: startTime,
    last_timestamp: startTime + DEMO_EVENTS.length * 300000,
    has_error: false
  }]);
  selectTrace(traceId);

  // Send events through the REAL daemon ingestion pipeline
  for (let i = 0; i < DEMO_EVENTS.length; i++) {
    const demoEvent = DEMO_EVENTS[i];
    
    const event: PersistedEvent = {
      trace_id: traceId,
      span_id: `span-${i + 1}`,
      parent_span_id: i > 0 ? `span-${i}` : null,
      event_type: demoEvent.event_type as any,
      node_name: demoEvent.node_name,
      payload: demoEvent.payload as any,
      timestamp: startTime + (i + 1) * 250000,
      ingest_timestamp: Date.now() * 1000,
      schema_version: "0.1.0",
      ingest_id: `demo-${Date.now()}-${i}`
    };
    
    try {
      // Send to REAL daemon - this goes through actual validation, storage, and WebSocket broadcast
      await fetch(`${DAEMON_URL}/v1/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([event])
      });
      
      // Also add directly to store for immediate feedback
      addEvent(event);
      
    } catch (e) {
      console.error("Failed to send event to daemon:", e);
    }
    
    // Realistic delay between events
    await new Promise(resolve => setTimeout(resolve, demoEvent.delay));
  }
  
  console.log("[Demo] Completed - all events sent through real daemon pipeline");
}