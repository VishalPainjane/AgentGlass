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
from typing import Any, Dict, List, Optional, Union
from uuid import uuid4

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import BaseMessage
from .client import AgentGlassClient, AgentGlassEvent, _current_trace_id, _current_span_id


def _now_microseconds() -> int:
    return time.time_ns() // 1000


def _safe_serialize(obj: Any) -> Any:
    """Attempt to serialize an object to a JSON-safe format."""
    if isinstance(obj, (str, int, float, bool, type(None))):
        return obj
    if isinstance(obj, dict):
        return {str(k): _safe_serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_safe_serialize(x) for x in obj]
    if isinstance(obj, BaseMessage):
        return {"content": obj.content, "type": obj.type, "name": getattr(obj, "name", None)}
    
    try:
        # Check if it's already JSON serializable
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)


class AgentGlassLangGraphCallback(BaseCallbackHandler):
    """
    Proper LangChain Callback Handler for AgentGlass.
    Hooks into the LangChain/LangGraph lifecycle to emit telemetry.
    """

    def __init__(
        self,
        client: AgentGlassClient,
        trace_id: str | None = None,
        parent_span_id: str | None = None,
        llm_label: str | None = None,
    ) -> None:
        self.client = client
        self.trace_id = trace_id or str(uuid4())
        self.root_span_id = parent_span_id or str(uuid4())
        self.llm_label = llm_label
        self._span_stack: List[str] = [self.root_span_id]
        
        # Map of run_id -> span_id to track nested calls correctly
        self._run_to_span: Dict[str, str] = {}
        self._llm_start_times: Dict[str, int] = {}

    def on_chain_start(
        self,
        serialized: Dict[str, Any],
        inputs: Dict[str, Any],
        *,
        run_id: Any,
        parent_run_id: Any = None,
        tags: List[str] | None = None,
        metadata: Dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        span_id = str(run_id)
        parent_span = str(parent_run_id) if parent_run_id else self.root_span_id
        self._run_to_span[run_id] = (span_id, parent_span)
        
        node_name = None
        if metadata:
            node_name = metadata.get("langgraph_node")
        if not node_name and serialized:
            node_name = serialized.get("name")
        if not node_name:
            node_name = "Chain"

        self.client.track(
            AgentGlassEvent(
                trace_id=self.trace_id,
                span_id=span_id,
                parent_span_id=parent_span,
                event_type="agent_start",
                node_name=node_name,
                payload={"inputs": _safe_serialize(inputs), "metadata": metadata},
            )
        )

    def on_chain_end(
        self,
        outputs: Dict[str, Any],
        *,
        run_id: Any,
        **kwargs: Any,
    ) -> None:
        span_id, parent_span = self._run_to_span.get(run_id, (str(run_id), self.root_span_id))
        
        self.client.track(
            AgentGlassEvent(
                trace_id=self.trace_id,
                span_id=span_id,
                parent_span_id=parent_span,
                event_type="agent_end",
                payload={"outputs": _safe_serialize(outputs)},
            )
        )

    def on_chain_error(
        self,
        error: BaseException,
        *,
        run_id: Any,
        **kwargs: Any,
    ) -> None:
        span_id, parent_span = self._run_to_span.get(run_id, (str(run_id), self.root_span_id))
        
        self.client.track(
            AgentGlassEvent(
                trace_id=self.trace_id,
                span_id=span_id,
                parent_span_id=parent_span,
                event_type="error",
                payload={"message": str(error), "type": type(error).__name__},
            )
        )

    def on_tool_start(
        self,
        serialized: Dict[str, Any],
        input_str: str,
        *,
        run_id: Any,
        parent_run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        span_id = str(run_id)
        parent_span = str(parent_run_id) if parent_run_id else self.root_span_id
        self._run_to_span[run_id] = (span_id, parent_span)
        
        tool_name = "Tool"
        if serialized:
            tool_name = serialized.get("name") or "Tool"

        self.client.track(
            AgentGlassEvent(
                trace_id=self.trace_id,
                span_id=span_id,
                parent_span_id=parent_span,
                event_type="tool_call",
                node_name=tool_name,
                payload={"input": input_str},
            )
        )

    def on_tool_end(
        self,
        output: Any,
        *,
        run_id: Any,
        **kwargs: Any,
    ) -> None:
        span_id, parent_span = self._run_to_span.get(run_id, (str(run_id), self.root_span_id))
        
        self.client.track(
            AgentGlassEvent(
                trace_id=self.trace_id,
                span_id=span_id,
                parent_span_id=parent_span,
                event_type="tool_result",
                payload={"result": _safe_serialize(output)},
            )
        )

    def on_llm_start(
        self,
        serialized: Dict[str, Any],
        prompts: List[str],
        *,
        run_id: Any,
        parent_run_id: Any = None,
        **kwargs: Any,
    ) -> None:
        span_id = str(run_id)
        parent_span = str(parent_run_id) if parent_run_id else self.root_span_id
        self._run_to_span[run_id] = (span_id, parent_span)
        
        invocation_params = kwargs.get("invocation_params") or {}
        model_name = (
            invocation_params.get("model")
            or invocation_params.get("model_name")
            or invocation_params.get("model_id")
        )
        provider_type = invocation_params.get("_type")
        if not model_name and serialized:
            model_name = serialized.get("name")
        if not model_name and serialized and isinstance(serialized.get("kwargs"), dict):
            model_name = serialized["kwargs"].get("model")
        if not model_name and self.llm_label and ":" in self.llm_label:
            model_name = self.llm_label.split(":", 1)[1]
        if not model_name:
            model_name = "unknown"

        provider_label = self.llm_label or provider_type

        self._llm_start_times[run_id] = _now_microseconds()

        self.client.track(
            AgentGlassEvent(
                trace_id=self.trace_id,
                span_id=span_id,
                parent_span_id=parent_span,
                event_type="llm_request",
                node_name=str(model_name),
                payload={
                    "prompts": prompts,
                    "params": invocation_params,
                    "provider": provider_label,
                    "model": model_name,
                    "start_time": self._llm_start_times[run_id],
                },
            )
        )

    def on_llm_end(
        self,
        response: Any,
        *,
        run_id: Any,
        **kwargs: Any,
    ) -> None:
        span_id, parent_span = self._run_to_span.get(run_id, (str(run_id), self.root_span_id))
        end_time = _now_microseconds()
        start_time = self._llm_start_times.pop(run_id, None)
        duration_micros = (end_time - start_time) if start_time else None

        token_usage = None
        finish_reason = None
        llm_output = getattr(response, "llm_output", None)
        if isinstance(llm_output, dict):
            token_usage = llm_output.get("token_usage") or llm_output.get("usage")
            finish_reason = llm_output.get("finish_reason")

        self.client.track(
            AgentGlassEvent(
                trace_id=self.trace_id,
                span_id=span_id,
                parent_span_id=parent_span,
                event_type="llm_response",
                node_name="LLM",
                payload={
                    "response": _safe_serialize(response),
                    "end_time": end_time,
                    "duration_micros": duration_micros,
                    "token_usage": _safe_serialize(token_usage) if token_usage else None,
                    "finish_reason": finish_reason,
                },
            )
        )


def instrument_langgraph(
    graph: Any,
    client: AgentGlassClient,
    trace_id: str | None = None,
    llm_label: str | None = None,
) -> Any:
    """
    Instrument a compiled LangGraph graph for AgentGlass telemetry.
    
    Injects a root span and configures callbacks to track node transitions.
    """
    tid = trace_id or _current_trace_id.get() or str(uuid4())
    root_sid = str(uuid4())
    
    callback = AgentGlassLangGraphCallback(client, trace_id=tid, parent_span_id=root_sid, llm_label=llm_label)

    original_invoke = graph.invoke
    original_ainvoke = getattr(graph, "ainvoke", None)
    original_stream = getattr(graph, "stream", None)
    original_astream = getattr(graph, "astream", None)

    def _prepare_kwargs(kwargs: Dict[str, Any]) -> Dict[str, Any]:
        if "config" not in kwargs:
            kwargs["config"] = {}
        
        config = kwargs["config"]
        if "callbacks" not in config:
            config["callbacks"] = []
        
        # Avoid double instrumentation
        if not any(isinstance(c, AgentGlassLangGraphCallback) for c in config["callbacks"]):
            config["callbacks"].append(callback)
            
        return kwargs

    def _normalize_config_args(args: tuple[Any, ...], kwargs: Dict[str, Any]) -> tuple[tuple[Any, ...], Dict[str, Any]]:
        """LangGraph may pass RunnableConfig positionally; avoid duplicate config kwarg."""
        if not args:
            return args, kwargs
        if "config" in kwargs:
            return (), kwargs
        normalized = dict(kwargs)
        normalized["config"] = args[0]
        return (), normalized

    def instrumented_invoke(input_data: Any, *args: Any, **kwargs: Any) -> Any:
        # Emit root agent_start
        client.track(
            AgentGlassEvent(
                trace_id=tid,
                span_id=root_sid,
                parent_span_id=None,
                event_type="agent_start",
                node_name="LangGraph",
                payload={"input": _safe_serialize(input_data)},
            )
        )

        # Set context for any non-LangChain calls inside nodes
        t_token = _current_trace_id.set(tid)
        s_token = _current_span_id.set(root_sid)

        try:
            kwargs = _prepare_kwargs(kwargs)
            result = original_invoke(input_data, *args, **kwargs)

            client.track(
                AgentGlassEvent(
                    trace_id=tid,
                    span_id=root_sid,
                    event_type="agent_end",
                    payload={"output": _safe_serialize(result)},
                )
            )
            return result
        except Exception as error:
            client.track(
                AgentGlassEvent(
                    trace_id=tid,
                    span_id=root_sid,
                    event_type="error",
                    payload={"message": str(error)},
                )
            )
            raise
        finally:
            _current_trace_id.reset(t_token)
            _current_span_id.reset(s_token)

    async def instrumented_ainvoke(input_data: Any, *args: Any, **kwargs: Any) -> Any:
        client.track(
            AgentGlassEvent(
                trace_id=tid,
                span_id=root_sid,
                parent_span_id=None,
                event_type="agent_start",
                node_name="LangGraph",
                payload={"input": _safe_serialize(input_data)},
            )
        )

        t_token = _current_trace_id.set(tid)
        s_token = _current_span_id.set(root_sid)

        try:
            kwargs = _prepare_kwargs(kwargs)
            result = await original_ainvoke(input_data, *args, **kwargs)

            client.track(
                AgentGlassEvent(
                    trace_id=tid,
                    span_id=root_sid,
                    event_type="agent_end",
                    payload={"output": _safe_serialize(result)},
                )
            )
            return result
        except Exception as error:
            client.track(
                AgentGlassEvent(
                    trace_id=tid,
                    span_id=root_sid,
                    event_type="error",
                    payload={"message": str(error)},
                )
            )
            raise
        finally:
            _current_trace_id.reset(t_token)
            _current_span_id.reset(s_token)

    def instrumented_stream(input_data: Any, *args: Any, **kwargs: Any) -> Any:
        client.track(
            AgentGlassEvent(
                trace_id=tid,
                span_id=root_sid,
                parent_span_id=None,
                event_type="agent_start",
                node_name="LangGraph",
                payload={"input": _safe_serialize(input_data)},
            )
        )

        t_token = _current_trace_id.set(tid)
        s_token = _current_span_id.set(root_sid)

        try:
            args, kwargs = _normalize_config_args(args, kwargs)
            kwargs = _prepare_kwargs(kwargs)
            for item in original_stream(input_data, *args, **kwargs):
                yield item
            
            client.track(
                AgentGlassEvent(
                    trace_id=tid,
                    span_id=root_sid,
                    event_type="agent_end",
                    payload={"output": "stream_completed"},
                )
            )
        except Exception as error:
            client.track(
                AgentGlassEvent(
                    trace_id=tid,
                    span_id=root_sid,
                    event_type="error",
                    payload={"message": str(error)},
                )
            )
            raise
        finally:
            _current_trace_id.reset(t_token)
            _current_span_id.reset(s_token)

    async def instrumented_astream(input_data: Any, *args: Any, **kwargs: Any) -> Any:
        client.track(
            AgentGlassEvent(
                trace_id=tid,
                span_id=root_sid,
                parent_span_id=None,
                event_type="agent_start",
                node_name="LangGraph",
                payload={"input": _safe_serialize(input_data)},
            )
        )

        t_token = _current_trace_id.set(tid)
        s_token = _current_span_id.set(root_sid)

        try:
            args, kwargs = _normalize_config_args(args, kwargs)
            kwargs = _prepare_kwargs(kwargs)
            async for item in original_astream(input_data, *args, **kwargs):
                yield item
            
            client.track(
                AgentGlassEvent(
                    trace_id=tid,
                    span_id=root_sid,
                    event_type="agent_end",
                    payload={"output": "stream_completed"},
                )
            )
        except Exception as error:
            client.track(
                AgentGlassEvent(
                    trace_id=tid,
                    span_id=root_sid,
                    event_type="error",
                    payload={"message": str(error)},
                )
            )
            raise
        finally:
            _current_trace_id.reset(t_token)
            _current_span_id.reset(s_token)

    graph.invoke = instrumented_invoke
    if original_ainvoke:
        graph.ainvoke = instrumented_ainvoke
    if original_stream:
        graph.stream = instrumented_stream
    if original_astream:
        graph.astream = instrumented_astream
        
    return graph

