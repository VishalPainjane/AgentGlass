"""
Blob Offloading E2E Test

Generates a trace with a payload larger than 10KB to verify
the daemon's blob store and the dashboard's hydration hook.
"""

import time
import json
from uuid import uuid4
from agentglass_python import AgentGlassClient, AgentGlassEvent

def test_blob_offloading():
    client = AgentGlassClient()
    trace_id = client.start_trace()
    span_id = str(uuid4())
    
    # Create a large payload (~100KB)
    large_data = {
        "text": "A" * 100000,
        "metadata": {
            "key": "value",
            "index": list(range(1000))
        }
    }
    
    print(f"🚀 Sending large payload for trace: {trace_id}")
    
    client.track(AgentGlassEvent(
        trace_id=trace_id,
        span_id=span_id,
        event_type="agent_start",
        node_name="LargePayloadNode",
        payload=large_data
    ))
    
    client.close()
    print(f"✨ Large payload sent. Trace ID: {trace_id}")

if __name__ == "__main__":
    test_blob_offloading()
