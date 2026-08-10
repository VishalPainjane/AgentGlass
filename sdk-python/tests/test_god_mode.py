"""
God Mode E2E Test

Verifies that the Python SDK correctly pauses at a breakpoint and
resumes when a command is sent via the Daemon.
"""

import time
import threading
import httpx
import pytest
from uuid import uuid4
from agentglass_python import AgentGlassClient

DAEMON_URL = "http://127.0.0.1:8765"

def test_god_mode_intervention():
    client = AgentGlassClient(daemon_url=DAEMON_URL)
    trace_id = client.start_trace()
    span_id = str(uuid4())
    
    injected_data = {}
    
    def run_agent():
        nonlocal injected_data
        # This will block until a command is received
        injected_data = client.breakpoint("TestBreakpoint", trace_id=trace_id, span_id=span_id)

    thread = threading.Thread(target=run_agent)
    thread.start()
    
    # Wait for the agent to hit the breakpoint and start polling
    time.sleep(2)
    
    # Send the injection command via the daemon (simulating the dashboard)
    command_payload = {"field": "temperature", "value": "0.7"}
    response = httpx.post(
        f"{DAEMON_URL}/v1/commands",
        json={
            "trace_id": trace_id,
            "target_span": span_id,
            "command_type": "inject",
            "payload": command_payload
        }
    )
    assert response.status_code == 202
    
    # Wait for the thread to resume and finish
    thread.join(timeout=10)
    assert not thread.is_alive(), "Agent thread timed out waiting for injection"
    
    assert injected_data == command_payload
    client.close()

if __name__ == "__main__":
    test_god_mode_intervention()
