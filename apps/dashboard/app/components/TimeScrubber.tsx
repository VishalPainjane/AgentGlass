/**
 * TimeScrubber — Slider control for "Time Travel" debugging
 *
 * Allows the user to seek backward/forward in the trace's history.
 * Modifies the `playbackTimestamp` in the Zustand store.
 */

"use client";

import { useMemo, useState, useEffect } from "react";
import { useTraceStore } from "../hooks/useTraceStore";
import { formatTimestamp } from "../lib/eventHelpers";
import { motion } from "framer-motion";

export default function TimeScrubber() {
  const events = useTraceStore((s) => s.events);
  const selectedTraceId = useTraceStore((s) => s.selectedTraceId);
  const playbackTimestamp = useTraceStore((s) => s.playbackTimestamp);
  const setPlaybackTimestamp = useTraceStore((s) => s.setPlaybackTimestamp);

  // We need ALL events for the trace to determine the full timeline bounds,
  // regardless of the current playback state.
  const traceEvents = useMemo(() => {
    if (!selectedTraceId) return [];
    return events.filter((e) => e.trace_id === selectedTraceId);
  }, [events, selectedTraceId]);

  const [minTime, maxTime] = useMemo(() => {
    if (traceEvents.length === 0) return [0, 0];
    const first = traceEvents[0].timestamp;
    const last = traceEvents[traceEvents.length - 1].timestamp;
    return [first, last];
  }, [traceEvents]);

  // Local state for smooth dragging
  const [isDragging, setIsDragging] = useState(false);
  const [localValue, setLocalValue] = useState<number>(0);

  // Sync local slider state when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalValue(playbackTimestamp === null ? maxTime : playbackTimestamp);
    }
  }, [playbackTimestamp, maxTime, isDragging]);

  const handleScrub = (val: number) => {
    setLocalValue(val);
    setPlaybackTimestamp(val);
  };

  const isLive = playbackTimestamp === null || playbackTimestamp >= maxTime;

  if (traceEvents.length <= 1) return null; // No point scrubbing < 2 events

  return (
    <div className="scrubber-panel">
      <div className="scrubber-track-container">
        <div className="scrubber-info">
          <span className="scrubber-time">{formatTimestamp(minTime)}</span>
          <div className="scrubber-center">
            {isLive ? (
              <span className="live-indicator">
                <span className="live-dot" /> LIVE
              </span>
            ) : (
              <span className="replay-indicator">
                REPLAYING: {formatTimestamp(localValue)}
              </span>
            )}
          </div>
          <span className="scrubber-time">{formatTimestamp(maxTime)}</span>
        </div>

        <input
          type="range"
          min={minTime}
          max={maxTime}
          value={localValue}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => {
            setIsDragging(false);
            if (localValue >= maxTime) {
              setPlaybackTimestamp(null); // Snap back to live
            }
          }}
          onChange={(e) => handleScrub(Number(e.target.value))}
          className="scrubber-slider"
        />
        
        <div className="scrubber-ticks">
          {traceEvents.map((evt, i) => (
            <div
              key={evt.ingest_id || i}
              className="scrubber-tick"
              style={{
                left: `${((evt.timestamp - minTime) / (maxTime - minTime)) * 100}%`,
                background: evt.timestamp <= localValue ? "var(--accent)" : "var(--border)",
              }}
            />
          ))}
        </div>
      </div>
      {!isLive && (
        <button
          className="scrubber-snap-live"
          onClick={() => setPlaybackTimestamp(null)}
        >
          Go to Live
        </button>
      )}
    </div>
  );
}
