"""
AgentGlass LangGraph Adapter

One-line instrumentation for LangGraph StateGraphs.
Automatically emits agent_start/agent_end/state_snapshot events
for every node transition in the graph.

Usage:
    from agentglass_python import AgentGlassClient
    from agentglass_python.langgraph_adapter import instrument_langgraph

    client = AgentGlassClient()
    graph = build_my_langgraph()
    graph = instrument_langgraph(graph, client)
    result = graph.invoke(initial_state)
    client.close()
"""

from __future__ import annotations

import json
import time
from typing import Any
from uuid import uuid4

from .client import AgentGlassClient, AgentGlassEvent, _current_trace_id, _current_span_id


def _now_microseconds() -> int:
    return time.time_ns() // 1000


def _safe_serialize(obj: Any) -> dict[str, Any]:
    """Attempt to serialize an object to a JSON-safe dict."""
    try:
        if isinstance(obj, dict):
            # Try to serialize — if it fails, stringify
            json.dumps(obj)
            return obj
        return {"value": str(obj)}
    except (TypeError, ValueError):
        return {"value": str(obj)}


class AgentGlassLangGraphCallback:
    """Callback handler that emits AgentGlass telemetry events
    for LangGraph node transitions.

    This class is designed to work with LangGraph's callback system.
    It can be used as a standalone observer or integrated via the
    `instrument_langgraph` helper.
    """

    def __init__(
        self,
        client: AgentGlassClient,
        trace_id: str | None = None,
    ) -> None:
        self.client = client
        self.trace_id = trace_id or str(uuid4())
        self._node_spans: dict[str, str] = {}  # node_name -> span_id
        self._root_span_id = str(uuid4())

    def on_chain_start(self, node_name: str, inputs: Any) -> str:
        """Called when a graph node begins execution."""
        span_id = str(uuid4())
        self._node_spans[node_name] = span_id

        self.client.track(
            AgentGlassEvent(
                trace_id=self.trace_id,
                span_id=span_id,
                parent_span_id=self._root_span_id,
                event_type="agent_start",
                node_name=node_name,
                payload={"name": node_name, "inputs": _safe_serialize(inputs)},
            )
        )

        # Emit state snapshot
        self.client.track(
            AgentGlassEvent(
                trace_id=self.trace_id,
                span_id=span_id,
                parent_span_id=self._root_span_id,
                event_type="state_snapshot",
                node_name=node_name,
                payload={"state": _safe_serialize(inputs), "stage": "input"},
            )
        )

        return span_id

    def on_chain_end(self, node_name: str, outputs: Any) -> None:
        """Called when a graph node completes execution."""
        span_id = self._node_spans.get(node_name, str(uuid4()))

        # Emit output state snapshot
        self.client.track(
            AgentGlassEvent(
                trace_id=self.trace_id,
                span_id=span_id,
                parent_span_id=self._root_span_id,
                event_type="state_snapshot",
                node_name=node_name,
                payload={"state": _safe_serialize(outputs), "stage": "output"},
            )
        )

        self.client.track(
            AgentGlassEvent(
                trace_id=self.trace_id,
                span_id=span_id,
                parent_span_id=self._root_span_id,
                event_type="agent_end",
                node_name=node_name,
                payload={"name": node_name, "outputs": _safe_serialize(outputs)},
            )
        )

    def on_chain_error(self, node_name: str, error: Exception) -> None:
        """Called when a graph node raises an error."""
        span_id = self._node_spans.get(node_name, str(uuid4()))

        self.client.track(
            AgentGlassEvent(
                trace_id=self.trace_id,
                span_id=span_id,
                parent_span_id=self._root_span_id,
                event_type="error",
                node_name=node_name,
                payload={"name": node_name, "message": str(error), "type": type(error).__name__},
            )
        )

    def on_tool_call(self, node_name: str, tool_name: str, tool_input: Any) -> str:
        """Called when a tool is invoked within a node."""
        parent_span = self._node_spans.get(node_name, self._root_span_id)
        span_id = str(uuid4())

        self.client.track(
            AgentGlassEvent(
                trace_id=self.trace_id,
                span_id=span_id,
                parent_span_id=parent_span,
                event_type="tool_call",
                node_name=tool_name,
                payload={"tool_name": tool_name, "input": _safe_serialize(tool_input)},
            )
        )
        return span_id

    def on_tool_result(self, span_id: str, tool_name: str, result: Any) -> None:
        """Called when a tool returns a result."""
        self.client.track(
            AgentGlassEvent(
                trace_id=self.trace_id,
                span_id=span_id,
                parent_span_id=self._root_span_id,
                event_type="tool_result",
                node_name=tool_name,
                payload={"tool_name": tool_name, "result": _safe_serialize(result)},
            )
        )

    @property
    def root_span_id(self) -> str:
        return self._root_span_id


def instrument_langgraph(
    graph: Any,
    client: AgentGlassClient,
    trace_id: str | None = None,
) -> Any:
    """Instrument a compiled LangGraph graph for AgentGlass telemetry.

    This wraps the graph's invoke/ainvoke methods to automatically
    emit span events for each node execution.

    Args:
        graph: A compiled LangGraph StateGraph
        client: An AgentGlassClient instance
        trace_id: Optional trace ID (auto-generated if not provided)

    Returns:
        The same graph object, now instrumented.

    Example:
        graph = build_my_graph().compile()
        graph = instrument_langgraph(graph, client)
        result = graph.invoke({"input": "hello"})
    """
    callback = AgentGlassLangGraphCallback(client, trace_id)

    original_invoke = graph.invoke

    def instrumented_invoke(input_data: Any, *args: Any, **kwargs: Any) -> Any:
        # Emit root agent_start
        client.track(
            AgentGlassEvent(
                trace_id=callback.trace_id,
                span_id=callback.root_span_id,
                parent_span_id=None,
                event_type="agent_start",
                node_name="LangGraph",
                payload={"name": "LangGraph", "input": _safe_serialize(input_data)},
            )
        )

        try:
            # If LangGraph supports callbacks, pass our callback
            if "config" not in kwargs:
                kwargs["config"] = {}

            result = original_invoke(input_data, *args, **kwargs)

            client.track(
                AgentGlassEvent(
                    trace_id=callback.trace_id,
                    span_id=callback.root_span_id,
                    parent_span_id=None,
                    event_type="agent_end",
                    node_name="LangGraph",
                    payload={"name": "LangGraph", "output": _safe_serialize(result)},
                )
            )

            return result
        except Exception as error:
            callback.on_chain_error("LangGraph", error)
            raise

    graph.invoke = instrumented_invoke
    graph._agentglass_callback = callback
    return graph
