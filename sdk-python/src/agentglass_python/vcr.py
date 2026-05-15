import asyncio
import functools
import hashlib
import json
import os
import sqlite3
import time
from typing import Any, Callable, Literal, Optional, TypeVar

from .client import AgentGlassClient

F = TypeVar("F", bound=Callable[..., Any])

class VCRCache:
    """
    Zero-Cost Debugging Cache for LLM responses.
    Stores exact responses for deterministic prompts in a local SQLite DB.
    """

    def __init__(
        self, 
        db_path: str = ".agentglass/vcr_cache.db", 
        mode: Literal["record", "playback", "auto"] = "auto"
    ):
        self.mode = mode
        self.db_path = os.path.abspath(db_path)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._init_db()

    def _init_db(self) -> None:
        with self.conn:
            self.conn.execute('''
                CREATE TABLE IF NOT EXISTS llm_cache (
                    prompt_hash TEXT PRIMARY KEY,
                    model TEXT,
                    response TEXT,
                    tokens_in INT,
                    tokens_out INT,
                    created_at INT
                )
            ''')

    def _hash(self, model: str, kwargs: dict[str, Any]) -> str:
        # Remove volatile fields that don't affect output determinism
        clean_kwargs = {k: v for k, v in kwargs.items() if k not in ("api_key", "timeout", "client")}
        try:
            serialized = json.dumps(clean_kwargs, sort_keys=True, default=str)
        except TypeError:
            serialized = str(clean_kwargs)
            
        return hashlib.sha256(f"{model}:{serialized}".encode('utf-8')).hexdigest()

    def get(self, model: str, kwargs: dict[str, Any]) -> dict[str, Any] | None:
        if self.mode == "record":
            return None
            
        prompt_hash = self._hash(model, kwargs)
        cursor = self.conn.cursor()
        cursor.execute("SELECT response FROM llm_cache WHERE prompt_hash = ?", (prompt_hash,))
        row = cursor.fetchone()
        
        if row:
            try:
                return json.loads(row[0])
            except json.JSONDecodeError:
                return {"_raw": row[0]}
        return None

    def set(self, model: str, kwargs: dict[str, Any], response: Any) -> None:
        if self.mode == "playback":
            return
            
        prompt_hash = self._hash(model, kwargs)
        now = int(time.time() * 1000)
        
        # Best-effort JSON serialization
        try:
            if hasattr(response, "model_dump_json"):
                response_str = response.model_dump_json()
            elif hasattr(response, "json"):
                response_str = response.json()
            else:
                response_str = json.dumps(response, default=str)
        except Exception:
            response_str = str(response)

        with self.conn:
            self.conn.execute('''
                INSERT OR REPLACE INTO llm_cache (prompt_hash, model, response, tokens_in, tokens_out, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (prompt_hash, model, response_str, 0, 0, now))

    def clear(self) -> None:
        with self.conn:
            self.conn.execute('DELETE FROM llm_cache')


def agentglass_vcr(vcr: VCRCache, client: Optional[AgentGlassClient] = None, model_arg: str = "model") -> Callable[[F], F]:
    """
    Decorator to wrap LLM calls with the VCR cache.
    Supports both synchronous and asynchronous functions.
    
    If `client` is provided, it automatically logs the `llm_request` and `llm_response` 
    to AgentGlass, including a `cache_hit` flag.
    """
    def decorator(func: F) -> F:
        if asyncio.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                model = kwargs.get(model_arg, "unknown_model")
                cached_resp = vcr.get(model, kwargs)
                is_hit = cached_resp is not None
                
                if client:
                    client.track_event(
                        event_type="llm_request",
                        node_name=func.__name__,
                        payload={"model": model, "kwargs": kwargs, "vcr_mode": vcr.mode}
                    )

                if is_hit:
                    resp = cached_resp
                else:
                    resp = await func(*args, **kwargs)
                    vcr.set(model, kwargs, resp)
                
                if client:
                    payload = {"model": model, "cache_hit": is_hit, "vcr_mode": vcr.mode}
                    try:
                        if hasattr(resp, "model_dump"):
                            payload["response"] = resp.model_dump()
                        else:
                            payload["response"] = resp
                    except Exception:
                        payload["response"] = str(resp)
                    client.track_event(event_type="llm_response", node_name=func.__name__, payload=payload)
                return resp
            return async_wrapper # type: ignore
        else:
            @functools.wraps(func)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                model = kwargs.get(model_arg, "unknown_model")
                cached_resp = vcr.get(model, kwargs)
                is_hit = cached_resp is not None
                
                if client:
                    client.track_event(
                        event_type="llm_request",
                        node_name=func.__name__,
                        payload={"model": model, "kwargs": kwargs, "vcr_mode": vcr.mode}
                    )

                if is_hit:
                    resp = cached_resp
                else:
                    resp = func(*args, **kwargs)
                    vcr.set(model, kwargs, resp)
                
                if client:
                    payload = {"model": model, "cache_hit": is_hit, "vcr_mode": vcr.mode}
                    try:
                        if hasattr(resp, "model_dump"):
                            payload["response"] = resp.model_dump()
                        else:
                            payload["response"] = resp
                    except Exception:
                        payload["response"] = str(resp)
                    client.track_event(event_type="llm_response", node_name=func.__name__, payload=payload)
                return resp
            return sync_wrapper # type: ignore
    return decorator
