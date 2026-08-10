from __future__ import annotations

import json
import queue
import threading
import time
from contextvars import ContextVar
from typing import Any
from uuid import uuid4

import httpx
from pydantic import BaseModel, Field


SCHEMA_VERSION = "0.1.0"

_current_trace_id: ContextVar[str | None] = ContextVar("_current_trace_id", default=None)
_current_span_id: ContextVar[str | None] = ContextVar("_current_span_id", default=None)


def _now_microseconds() -> int:
    return time.time_ns() // 1000


class AgentGlassEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    trace_id: str
    span_id: str
    parent_span_id: str | None = None
    event_type: str
    node_name: str = ""
    payload: dict[str, Any] | None = None
    timestamp: int = Field(default_factory=_now_microseconds)
    schema_version: str = SCHEMA_VERSION


class AgentGlassClient:
    """Non-blocking telemetry client that dispatches events to the local daemon."""

    def __init__(
        self,
        daemon_url: str = "http://127.0.0.1:8765",
        flush_interval_ms: int = 250,
        max_batch_size: int = 50,
        request_timeout_s: float = 2.0,
    ) -> None:
        self.daemon_url = daemon_url.rstrip("/")
        self.flush_interval_ms = flush_interval_ms
        self.max_batch_size = max_batch_size
        self.request_timeout_s = request_timeout_s

        self._queue: queue.Queue[AgentGlassEvent] = queue.Queue()
        self._stop_event = threading.Event()
        self._worker = threading.Thread(target=self._run_worker, daemon=True)
        self._worker.start()

    # ---- convenience helpers ----

    def start_trace(self) -> str:
        """Generate a new trace ID and set it in context."""
        trace_id = str(uuid4())
        _current_trace_id.set(trace_id)
        return trace_id

    def wait_for_injection(self, trace_id: str, span_id: str, timeout: float = 300.0, poll_interval: float = 1.0) -> dict | None:
        """
        Blocks and polls the daemon for a 'state_injection' event targeted at this span.
        Returns the injected payload dict if found, otherwise returns None after timeout.
        """
        start_time = time.time()
        url = f"{self.daemon_url}/v1/traces/{trace_id}/events"
        
        with httpx.Client(timeout=5.0) as http_client:
            while time.time() - start_time < timeout:
                try:
                    response = http_client.get(url)
                    if response.status_code == 200:
                        events = response.json().get("events", [])
                        for event in reversed(events): # Look from newest to oldest
                            if event.get("span_id") == span_id and event.get("event_type") == "state_injection":
                                return event.get("payload", {})
                except Exception:
                    pass # Ignore connection errors during polling
                
                time.sleep(poll_interval)
        
        return None

    def poll_commands(self, trace_id: str | None = None, span_id: str | None = None) -> list[dict[str, Any]]:
        """
        Polls the local daemon for pending God Mode commands targeted at this span.
        Commands are automatically marked as acknowledged by the daemon.
        """
        tid = trace_id or _current_trace_id.get()
        sid = span_id or _current_span_id.get()
        
        if not tid or not sid:
            return []
            
        url = f"{self.daemon_url}/v1/commands/poll"
        
        try:
            with httpx.Client(timeout=2.0) as http_client:
                response = http_client.post(url, json={"trace_id": tid, "target_span": sid})
                if response.status_code == 200:
                    return response.json().get("commands", [])
        except Exception:
            pass # Ignore connection errors during polling
            
        return []

    def breakpoint(self, name: str = "Breakpoint", trace_id: str | None = None, span_id: str | None = None) -> dict[str, Any] | None:
        """
        Pauses execution and waits for a God Mode command from the dashboard.
        Emits a 'breakpoint' event to notify the UI.
        """
        tid = trace_id or _current_trace_id.get() or str(uuid4())
        sid = span_id or _current_span_id.get() or str(uuid4())
        
        self.track_event(
            event_type="breakpoint",
            node_name=name,
            trace_id=tid,
            span_id=sid,
            payload={"status": "paused"}
        )
        
        print(f"\n🛑 AgentGlass Breakpoint: {name} (Trace: {tid[:8]}, Span: {sid[:8]})")
        print("   Waiting for intervention from the dashboard...")
        
        while not self._stop_event.is_set():
            commands = self.poll_commands(tid, sid)
            for cmd in commands:
                print(f"   📥 Received Command: {cmd['command_type']}")
                
                # Acknowledge and resume if it's an injection
                if cmd['command_type'] == 'inject':
                    payload = json.loads(cmd['payload'])
                    print(f"   ✅ Injected: {payload.get('field')} = {payload.get('value')}")
                    
                    self.track_event(
                        event_type="state_injection",
                        node_name=name,
                        trace_id=tid,
                        span_id=sid,
                        payload=payload
                    )
                    return payload
                
                # If we add more command types (like 'resume'), handle them here
                if cmd['command_type'] == 'resume':
                    return None
                    
            time.sleep(1.0)
        return None


    # ---- tracking ----

    def track(self, event: AgentGlassEvent | dict[str, Any]) -> None:
        if isinstance(event, AgentGlassEvent):
            parsed = event
        else:
            parsed = AgentGlassEvent.model_validate(event)

        self._queue.put(parsed)

    def track_event(
        self,
        event_type: str,
        node_name: str = "",
        payload: dict[str, Any] | None = None,
        trace_id: str | None = None,
        span_id: str | None = None,
        parent_span_id: str | None = None,
    ) -> None:
        """High-level tracking with automatic context propagation."""
        self.track(
            AgentGlassEvent(
                trace_id=trace_id or _current_trace_id.get() or str(uuid4()),
                span_id=span_id or _current_span_id.get() or str(uuid4()),
                parent_span_id=parent_span_id or None,
                event_type=event_type,
                node_name=node_name,
                payload=payload or {},
            )
        )

    # ---- lifecycle ----

    def close(self) -> None:
        self._stop_event.set()
        self._worker.join(timeout=2.0)

    # ---- internal ----

    def _drain_batch(self, pending: list[AgentGlassEvent]) -> list[AgentGlassEvent]:
        batch = pending[:]
        pending.clear()

        while len(batch) < self.max_batch_size:
            try:
                batch.append(self._queue.get_nowait())
            except queue.Empty:
                break

        return batch

    def _flush(self, batch: list[AgentGlassEvent]) -> None:
        payload = [item.model_dump() for item in batch]

        try:
            response = httpx.post(
                f"{self.daemon_url}/v1/events",
                json=payload,
                timeout=self.request_timeout_s,
            )
            if response.status_code >= 400:
                for event in batch:
                    self._queue.put(event)
        except Exception:
            for event in batch:
                self._queue.put(event)

    def _run_worker(self) -> None:
        pending: list[AgentGlassEvent] = []
        interval_seconds = self.flush_interval_ms / 1000
        last_flush = time.monotonic()

        while not self._stop_event.is_set() or not self._queue.empty() or pending:
            try:
                event = self._queue.get(timeout=interval_seconds)
                pending.append(event)
            except queue.Empty:
                pass

            elapsed = time.monotonic() - last_flush
            should_flush = len(pending) >= self.max_batch_size or elapsed >= interval_seconds

            if should_flush and pending:
                batch = self._drain_batch(pending)
                self._flush(batch)
                last_flush = time.monotonic()
