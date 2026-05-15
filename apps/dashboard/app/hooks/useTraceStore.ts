import { create } from "zustand";
import { useMemo } from "react";
import type { PersistedEvent, TraceMetadata } from "../lib/eventHelpers";

/* ------------------------------------------------------------------ */
/*  Store Shape                                                       */
/* ------------------------------------------------------------------ */

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface TraceStoreState {
  /* --- data --- */
  events: PersistedEvent[];
  traces: TraceMetadata[];
  selectedTraceId: string | null;
  compareTraceId: string | null;
  selectedSpanId: string | null;
  connectionStatus: ConnectionStatus;
  isDemoMode: boolean;
  
  /* --- time travel --- */
  playbackTimestamp: number | null; // If null, tracking live edge. Otherwise, timestamp to replay to.
  isFetching: boolean;
  denseMode: boolean;

  /* --- actions --- */
  addEvent: (event: PersistedEvent) => void;
  bootstrap: (events: PersistedEvent[]) => void;
  setTraces: (traces: TraceMetadata[]) => void;
  selectTrace: (traceId: string | null) => void;
  setCompareTraceId: (traceId: string | null) => void;
  selectNode: (spanId: string | null) => void;
  setEvents: (events: PersistedEvent[]) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setDemoMode: (isDemoMode: boolean) => void;
  setPlaybackTimestamp: (timestamp: number | null) => void;
  clearEvents: () => void;
  fetchTraceEvents: (traceId: string) => Promise<void>;
  setIsFetching: (isFetching: boolean) => void;
  setDenseMode: (dense: boolean) => void;
}

/* ------------------------------------------------------------------ */
/*  Store                                                             */
/* ------------------------------------------------------------------ */

export const useTraceStore = create<TraceStoreState>((set, get) => ({
  events: [],
  traces: [],
  selectedTraceId: null,
  compareTraceId: null,
  selectedSpanId: null,
  connectionStatus: "connecting",
  isDemoMode: false,
  playbackTimestamp: null,
  isFetching: false,
  denseMode: false,

  addEvent: (event) => {
    set((state) => {
      // Idempotency: skip duplicate events by ingest_id
      const eventId = event.ingest_id || `${event.span_id}-${event.timestamp}`;
      if (state.events.some((e) => (e.ingest_id || `${e.span_id}-${event.timestamp}`) === eventId)) {
        return state; // no-op for duplicates
      }

      // Maintain chronological order
      const newEvents = [...state.events, event].sort((a, b) => a.timestamp - b.timestamp);

      // Auto-select the first trace if none selected
      const selectedTraceId = state.selectedTraceId ?? event.trace_id;

      // Update trace metadata inline
      const traceMap = new Map(state.traces.map((t) => [t.trace_id, t]));
      const existing = traceMap.get(event.trace_id);

      if (existing) {
        traceMap.set(event.trace_id, {
          ...existing,
          event_count: existing.event_count + 1,
          last_timestamp: Math.max(existing.last_timestamp, event.timestamp),
          has_error: existing.has_error || event.event_type === "error",
        });
      } else {
        traceMap.set(event.trace_id, {
          trace_id: event.trace_id,
          event_count: 1,
          first_timestamp: event.timestamp,
          last_timestamp: event.timestamp,
          has_error: event.event_type === "error",
        });
      }

      return {
        events: newEvents,
        traces: Array.from(traceMap.values()),
        selectedTraceId,
      };
    });
  },

  bootstrap: (events) => {
    // Deduplicate by ingest_id and sort by timestamp for stable ordering
    const seen = new Set<string>();
    const deduped: PersistedEvent[] = [];
    for (const event of events) {
      const eventId = event.ingest_id || `${event.span_id}-${event.timestamp}`;
      if (!seen.has(eventId)) {
        seen.add(eventId);
        deduped.push(event);
      }
    }
    deduped.sort((a, b) => a.timestamp - b.timestamp);

    // Build trace metadata from deduplicated events
    const traceMap = new Map<string, TraceMetadata>();
    for (const event of deduped) {
      const existing = traceMap.get(event.trace_id);
      if (existing) {
        existing.event_count++;
        existing.first_timestamp = Math.min(existing.first_timestamp, event.timestamp);
        existing.last_timestamp = Math.max(existing.last_timestamp, event.timestamp);
        existing.has_error = existing.has_error || event.event_type === "error";
      } else {
        traceMap.set(event.trace_id, {
          trace_id: event.trace_id,
          event_count: 1,
          first_timestamp: event.timestamp,
          last_timestamp: event.timestamp,
          has_error: event.event_type === "error",
        });
      }
    }

    const traces = Array.from(traceMap.values());
    const selectedTraceId = traces.length > 0 ? traces[0].trace_id : null;

    set({ events: deduped, traces, selectedTraceId });
  },

  setTraces: (traces) => set({ traces }),

  selectTrace: (traceId) => {
    set({ selectedTraceId: traceId, selectedSpanId: null, playbackTimestamp: null });
    if (traceId) {
      get().fetchTraceEvents(traceId);
    }
  },

  setCompareTraceId: (traceId) => {
    set({ compareTraceId: traceId });
    if (traceId) {
      get().fetchTraceEvents(traceId);
    }
  },

  selectNode: (spanId) => set({ selectedSpanId: spanId }),

  setEvents: (events) => set({ events }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setDemoMode: (isDemoMode) => set({ isDemoMode }),
  
  setPlaybackTimestamp: (timestamp) => set({ playbackTimestamp: timestamp }),

  clearEvents: () => set({ events: [], traces: [], selectedTraceId: null, compareTraceId: null, selectedSpanId: null, playbackTimestamp: null, isDemoMode: false }),

  setIsFetching: (isFetching) => set({ isFetching: true }),

  setDenseMode: (denseMode) => set({ denseMode }),

  fetchTraceEvents: async (traceId) => {
    try {
      set({ isFetching: true });
      // Import dynamically to avoid circular dependency or SSR issues
      const { daemonHttp } = await import("../lib/daemonApi");
      const res = await fetch(daemonHttp(`/v1/traces/${traceId}/events`));
      if (res.ok) {
        const data = await res.json();
        const events = data.events as PersistedEvent[];
        
        set((state) => {
          // Merge with existing events, deduplicate
          const seen = new Set(state.events.map(e => e.ingest_id || `${e.span_id}-${e.timestamp}`));
          const newEvents = [...state.events];
          
          let changed = false;
          for (const event of events) {
            const id = event.ingest_id || `${event.span_id}-${event.timestamp}`;
            if (!seen.has(id)) {
              newEvents.push(event);
              seen.add(id);
              changed = true;
            }
          }
          
          return {
            events: newEvents.sort((a, b) => a.timestamp - b.timestamp),
            isFetching: false
          };
        });
      } else {
        set({ isFetching: false });
      }
    } catch (err) {
      console.error(`Failed to fetch events for trace ${traceId}:`, err);
      set({ isFetching: false });
    }
  },
}));


/* ------------------------------------------------------------------ */
/*  Derived Hooks (memoized to avoid infinite re-render loops)        */
/* ------------------------------------------------------------------ */

/** Events filtered to the currently selected trace AND playback timestamp. */
export function useSelectedTraceEvents(): PersistedEvent[] {
  const events = useTraceStore((s) => s.events);
  const selectedTraceId = useTraceStore((s) => s.selectedTraceId);
  const playbackTimestamp = useTraceStore((s) => s.playbackTimestamp);

  return useMemo(() => {
    let filtered = events;
    if (selectedTraceId) {
      filtered = filtered.filter((e) => e.trace_id === selectedTraceId);
    }
    if (playbackTimestamp !== null) {
      filtered = filtered.filter((e) => e.timestamp <= playbackTimestamp);
    }
    return filtered;
  }, [events, selectedTraceId, playbackTimestamp]);
}

/** Events filtered to the compare trace. Ignore playback bounds. */
export function useCompareTraceEvents(): PersistedEvent[] {
  const events = useTraceStore((s) => s.events);
  const compareTraceId = useTraceStore((s) => s.compareTraceId);

  return useMemo(() => {
    if (!compareTraceId) return [];
    return events.filter((e) => e.trace_id === compareTraceId);
  }, [events, compareTraceId]);
}

/** Events for the currently selected node/span up to playbackTimestamp. */
export function useSelectedNodeEvents(): PersistedEvent[] {
  const traceEvents = useSelectedTraceEvents();
  const selectedSpanId = useTraceStore((s) => s.selectedSpanId);

  return useMemo(() => {
    if (!selectedSpanId) return [];
    return traceEvents.filter((e) => e.span_id === selectedSpanId);
  }, [traceEvents, selectedSpanId]);
}
