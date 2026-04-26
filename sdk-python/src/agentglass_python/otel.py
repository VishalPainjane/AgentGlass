import json
import logging
from typing import Optional, Any

try:
    from opentelemetry.sdk.trace import ReadableSpan, SpanProcessor
    from opentelemetry.trace import SpanKind
    from opentelemetry.context import Context
except ImportError:
    raise ImportError("Please install with `pip install agentglass-python[otel]` to use OTel integration.")

from .client import AgentGlassClient

logger = logging.getLogger(__name__)


def _extract_attributes(span: ReadableSpan) -> dict[str, Any]:
    """Helper to convert OTel attributes to a standard dict."""
    attrs = {}
    if span.attributes:
        for k, v in span.attributes.items():
            attrs[k] = v
    return attrs


def _map_span_kind_to_event_type(kind: SpanKind, is_start: bool) -> str:
    """Heuristic mapping from OTel SpanKind to AgentGlass event_type."""
    if kind == SpanKind.CLIENT:
        return "llm_request" if is_start else "llm_response"
    elif kind == SpanKind.SERVER:
        return "agent_start" if is_start else "agent_end"
    elif kind == SpanKind.INTERNAL:
        return "tool_call" if is_start else "tool_result"
    
    # Default fallback
    return "agent_start" if is_start else "agent_end"


class AgentGlassSpanProcessor(SpanProcessor):
    """
    OpenTelemetry SpanProcessor that streams OTel spans live into the AgentGlass local daemon.
    Allows developers to use standard OTel instrumentation while getting the benefits 
    of the local-first deterministic time-travel dashboard.
    """
    
    def __init__(self, client: AgentGlassClient):
        self.client = client

    def on_start(self, span: ReadableSpan, parent_context: Optional[Context] = None) -> None:
        trace_id = format(span.context.trace_id, "032x")
        span_id = format(span.context.span_id, "016x")
        parent_span_id = format(span.parent.span_id, "016x") if span.parent else None

        event_type = _map_span_kind_to_event_type(span.kind, is_start=True)
        payload = _extract_attributes(span)

        self.client.track(
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=parent_span_id,
            event_type=event_type,
            node_name=span.name,
            payload=payload
        )

    def on_end(self, span: ReadableSpan) -> None:
        trace_id = format(span.context.trace_id, "032x")
        span_id = format(span.context.span_id, "016x")
        parent_span_id = format(span.parent.span_id, "016x") if span.parent else None

        # Check if the span had an error
        is_error = not span.status.is_ok if hasattr(span, "status") and span.status else False
        event_type = "error" if is_error else _map_span_kind_to_event_type(span.kind, is_start=False)
        
        payload = _extract_attributes(span)
        if hasattr(span, "events") and span.events:
            payload["otel_events"] = [
                {"name": e.name, "attributes": dict(e.attributes or {})} 
                for e in span.events
            ]

        self.client.track(
            trace_id=trace_id,
            span_id=span_id,
            parent_span_id=parent_span_id,
            event_type=event_type,
            node_name=span.name,
            payload=payload
        )

    def shutdown(self) -> None:
        pass
    
    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True
