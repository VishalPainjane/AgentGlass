# agentglass-python

Python SDK scaffold for AgentGlass.

## Install

```bash
pip install -e .
```

## CLI

```bash
agentglass up
```

## Minimal Usage

```python
from agentglass_python import AgentGlassClient

client = AgentGlassClient()
client.track({
    "trace_id": "trace-1",
    "span_id": "span-1",
    "event_type": "agent_start"
})
client.close()
```
