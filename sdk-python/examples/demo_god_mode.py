"""
AgentGlass Demo — God Mode Breakpoint

Demonstrates how to use the breakpoint() feature to pause agent execution
and wait for manual state injection from the dashboard.
"""

import time
from agentglass_python import AgentGlassClient

def main():
    client = AgentGlassClient()
    trace_id = client.start_trace()
    
    print("Starting Agent with Breakpoint...")
    
    # Simulate some initial work
    client.track_event("agent_start", node_name="Initializer", payload={"status": "starting"})
    time.sleep(1)
    client.track_event("agent_end", node_name="Initializer", payload={"status": "ready"})
    
    # The Breakpoint!
    # In the dashboard, you would:
    # 1. Select this node in the graph
    # 2. Open God Mode (⚡ button)
    # 3. Type: inject temperature = 0.5
    injection = client.breakpoint("UserIntervention")
    
    if injection:
        print(f"Agent Resumed with injected data: {injection}")
        # Use the injected data
        client.track_event("agent_start", node_name="Processor", payload={"using_data": injection})
        time.sleep(1)
        client.track_event("agent_end", node_name="Processor", payload={"result": "success"})
    else:
        print("Breakpoint resumed without injection (e.g. stop event).")

    client.close()
    print("\nDone!")

if __name__ == "__main__":
    main()
