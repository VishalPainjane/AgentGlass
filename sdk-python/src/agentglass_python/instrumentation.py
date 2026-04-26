from __future__ import annotations

import asyncio
import functools
import inspect
from typing import Any, Callable, TypeVar
from uuid import uuid4

from .client import AgentGlassClient, _current_span_id, _current_trace_id

F = TypeVar("F", bound=Callable[..., Any])


def with_agentglass(
    client: AgentGlassClient,
    name: str,
    trace_id: str | None = None,
) -> Callable[[F], F]:
    """Decorator that wraps a function with AgentGlass span instrumentation.

    Supports both sync and async functions.  Automatically threads
    parent_span_id via contextvars so nested decorated functions
    produce a proper span hierarchy.
    """

    def decorator(function: F) -> F:
        if inspect.iscoroutinefunction(function):

            @functools.wraps(function)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                tid = trace_id or _current_trace_id.get() or str(uuid4())
                parent = _current_span_id.get()
                sid = str(uuid4())

                # Set context for nested calls
                trace_token = _current_trace_id.set(tid)
                span_token = _current_span_id.set(sid)

                client.track(
                    {
                        "trace_id": tid,
                        "span_id": sid,
                        "parent_span_id": parent,
                        "event_type": "agent_start",
                        "node_name": name,
                        "payload": {"name": name},
                    }
                )

                try:
                    result = await function(*args, **kwargs)
                    client.track(
                        {
                            "trace_id": tid,
                            "span_id": sid,
                            "parent_span_id": parent,
                            "event_type": "agent_end",
                            "node_name": name,
                            "payload": {"name": name},
                        }
                    )
                    return result
                except Exception as error:
                    client.track(
                        {
                            "trace_id": tid,
                            "span_id": sid,
                            "parent_span_id": parent,
                            "event_type": "error",
                            "node_name": name,
                            "payload": {"name": name, "message": str(error)},
                        }
                    )
                    raise
                finally:
                    _current_trace_id.reset(trace_token)
                    _current_span_id.reset(span_token)

            return async_wrapper  # type: ignore[return-value]

        else:

            @functools.wraps(function)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                tid = trace_id or _current_trace_id.get() or str(uuid4())
                parent = _current_span_id.get()
                sid = str(uuid4())

                trace_token = _current_trace_id.set(tid)
                span_token = _current_span_id.set(sid)

                client.track(
                    {
                        "trace_id": tid,
                        "span_id": sid,
                        "parent_span_id": parent,
                        "event_type": "agent_start",
                        "node_name": name,
                        "payload": {"name": name},
                    }
                )

                try:
                    result = function(*args, **kwargs)
                    client.track(
                        {
                            "trace_id": tid,
                            "span_id": sid,
                            "parent_span_id": parent,
                            "event_type": "agent_end",
                            "node_name": name,
                            "payload": {"name": name},
                        }
                    )
                    return result
                except Exception as error:
                    client.track(
                        {
                            "trace_id": tid,
                            "span_id": sid,
                            "parent_span_id": parent,
                            "event_type": "error",
                            "node_name": name,
                            "payload": {"name": name, "message": str(error)},
                        }
                    )
                    raise
                finally:
                    _current_trace_id.reset(trace_token)
                    _current_span_id.reset(span_token)

            return sync_wrapper  # type: ignore[return-value]

    return decorator
