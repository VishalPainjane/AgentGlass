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
import { useHasMounted } from "../hooks/useHasMounted";

export default function TimeScrubber() {
  const events = useTraceStore((s) => s.events);
  const selectedTraceId = useTraceStore((s) => s.selectedTraceId);
  const playbackTimestamp = useTraceStore((s) => s.playbackTimestamp);
  const setPlaybackTimestamp = useTraceStore((s) => s.setPlaybackTimestamp);
  const hasMounted = useHasMounted();

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

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (traceEvents.length <= 1) return;
      
      // Ignore if user is typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (isLive) {
          // Snap back to first event
          handleScrub(minTime);
        } else {
          // Return to live
          setPlaybackTimestamp(null);
        }
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        const currentIndex = traceEvents.findIndex(ev => ev.timestamp > (playbackTimestamp ?? maxTime)) - 1;
        const targetIndex = Math.max(0, (currentIndex === -2 ? traceEvents.length - 1 : currentIndex) - 1);
        handleScrub(traceEvents[targetIndex].timestamp);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        if (isLive) return;
        const currentIndex = traceEvents.findIndex(ev => ev.timestamp > playbackTimestamp!);
        if (currentIndex === -1 || currentIndex >= traceEvents.length - 1) {
          setPlaybackTimestamp(null);
        } else {
          handleScrub(traceEvents[currentIndex].timestamp);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [traceEvents, playbackTimestamp, isLive, maxTime, minTime, setPlaybackTimestamp]);

  if (traceEvents.length <= 1) return null; // No point scrubbing < 2 events

  return (
    <div className="scrubber-panel">
      <div className="scrubber-track-container">
        <div className="scrubber-info">
          <span className="scrubber-time">{hasMounted ? formatTimestamp(minTime) : "…"}</span>
          <div className="scrubber-center">
            {isLive ? (
              <span className="live-indicator">
                <span className="live-dot" /> LIVE
              </span>
            ) : (
              <span className="replay-indicator">
                REPLAYING: {hasMounted ? formatTimestamp(localValue) : "…"}
              </span>
            )}
          </div>
          <span className="scrubber-time">{hasMounted ? formatTimestamp(maxTime) : "…"}</span>
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
