#!/usr/bin/env python3
"""Quick trace inspector for validation."""
import json
import sys
import urllib.request

DAEMON = "http://127.0.0.1:8765"


def fetch(path: str):
    with urllib.request.urlopen(f"{DAEMON}{path}") as resp:
        return json.load(resp)


def main():
    trace_id = sys.argv[1] if len(sys.argv) > 1 else None
    if not trace_id:
        traces = fetch("/v1/traces")["traces"]
        for t in traces:
            tid = t["trace_id"]
            ev = fetch(f"/v1/traces/{tid}/events")["events"]
            nodes = sorted({e.get("node_name") for e in ev if e.get("node_name")})
            llm = sum(1 for e in ev if e["event_type"] == "llm_request")
            tools = sum(1 for e in ev if e["event_type"] == "tool_call")
            blocked = any(
                n and ("compliance_blocked" in n.lower() or "paymentgateway" in n.lower())
                for n in nodes
            )
            print(f"{tid[:8]}  events={len(ev):2d}  llm={llm}  tools={tools}  blocked={blocked}")
            print(f"         nodes: {', '.join(nodes)}")
        return

    events = fetch(f"/v1/traces/{trace_id}/events")["events"]
    print(f"Trace {trace_id} — {len(events)} events\n")
    for e in events:
        print(f"  {e['event_type']:15} {e.get('node_name', '')}")

    print("\n--- LLM events ---")
    for e in events:
        if "llm" in e["event_type"]:
            print(json.dumps(e, indent=2)[:2000])
            print()

    print("\n--- Tool/retrieval events ---")
    for e in events:
        if e["event_type"] in ("tool_call", "tool_result"):
            print(e["event_type"], e.get("node_name"))
            print(json.dumps(e["payload"], indent=2)[:1500])
            print()


if __name__ == "__main__":
    main()
