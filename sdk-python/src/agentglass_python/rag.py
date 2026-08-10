from typing import Any
from .client import AgentGlassClient

def log_retrieval(
    client: AgentGlassClient,
    query: str,
    results: list[dict[str, Any]],
    node_name: str = "retriever",
    span_id: str | None = None,
    trace_id: str | None = None,
) -> None:
    """
    Convenience method to log RAG retrieval results in the AgentGlass format.
    
    The payload.retrieval_results[] array will be rendered by the RAG X-Ray Panel.
    Each result dict should contain:
      - text (str): The retrieved chunk text
      - score (float): The relevance score
      - source (str, optional): The document source/title
      - metadata (dict, optional): Additional metadata
    """
    payload = {
        "query": query,
        "retrieval_results": results
    }
    
    client.track_event(
        event_type="tool_result",
        node_name=node_name,
        payload=payload,
        trace_id=trace_id,
        span_id=span_id,
    )
