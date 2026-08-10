"""
E2E Features Test - RAG X-Ray & VCR Cache

This script generates a trace that includes:
1. RAG retrieval metadata (to test RAG X-Ray visualization)
2. LLM Request/Response with VCR metadata (to test Cache Manager)
3. An intentional error (to test Auto-Analysis fallback)
"""

import time
from uuid import uuid4
from agentglass_python import AgentGlassClient, AgentGlassEvent

def main():
    client = AgentGlassClient()
    trace_id = client.start_trace()
    
    print(f"🚀 Generating complex trace: {trace_id}")
    
    # 1. RAG Retrieval Node
    rag_span = str(uuid4())
    client.track(AgentGlassEvent(
        trace_id=trace_id,
        span_id=rag_span,
        event_type="agent_start",
        node_name="DocumentRetriever",
        payload={"query": "How to scale vector databases?"}
    ))
    
    time.sleep(0.5)
    
    # Retrieval Results (payload expected by dashboard for X-Ray)
    retrieval_payload = {
        "retrieval_results": [
            {
                "text": "Partitioning is a key strategy for scaling vector databases. It involves dividing the index into smaller, more manageable pieces.",
                "score": 0.92,
                "source": "architecture_guide.pdf",
                "metadata": {"page": 12, "section": "Scaling"}
            },
            {
                "text": "Horizontal scaling can be achieved by distributing the load across multiple nodes using a consistent hashing mechanism.",
                "score": 0.75,
                "source": "ops_manual.md",
                "metadata": {"author": "ops-team"}
            },
            {
                "text": "Vector database performance degrades as the number of dimensions increases, regardless of the scaling strategy.",
                "score": 0.45,
                "source": "whitepaper.pdf",
                "metadata": {"year": 2023}
            }
        ]
    }
    
    client.track(AgentGlassEvent(
        trace_id=trace_id,
        span_id=rag_span,
        event_type="agent_end",
        node_name="DocumentRetriever",
        payload=retrieval_payload
    ))
    
    # 2. LLM Call with VCR (Cache Hit)
    llm_span = str(uuid4())
    client.track(AgentGlassEvent(
        trace_id=trace_id,
        span_id=llm_span,
        parent_span_id=rag_span,
        event_type="llm_request",
        node_name="SummaryGenerator",
        payload={"model": "gpt-4o", "prompt": "Summarize the findings."}
    ))
    
    time.sleep(0.3)
    
    client.track(AgentGlassEvent(
        trace_id=trace_id,
        span_id=llm_span,
        parent_span_id=rag_span,
        event_type="llm_response",
        node_name="SummaryGenerator",
        payload={
            "model": "gpt-4o",
            "response": "To scale vector databases, use partitioning and horizontal scaling across multiple nodes.",
            "cache_hit": True,
            "vcr_mode": "playback",
            "usage": {"input_tokens": 150, "output_tokens": 40}
        }
    ))
    
    # 3. Intentional Error
    error_span = str(uuid4())
    client.track(AgentGlassEvent(
        trace_id=trace_id,
        span_id=error_span,
        parent_span_id=llm_span,
        event_type="agent_start",
        node_name="EmailSender",
        payload={"to": "admin@example.com"}
    ))
    
    time.sleep(0.2)
    
    client.track(AgentGlassEvent(
        trace_id=trace_id,
        span_id=error_span,
        parent_span_id=llm_span,
        event_type="error",
        node_name="EmailSender",
        payload={
            "message": "Connection refused: Unable to connect to SMTP server at smtp.example.com:587",
            "type": "ConnectionError"
        }
    ))
    
    client.close()
    print(f"✨ Trace generation complete. View Trace {trace_id[:8]} in Dashboard.")

if __name__ == "__main__":
    main()
