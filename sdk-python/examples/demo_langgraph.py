"""
AgentGlass Demo — Real LangGraph + LangChain Integration

This script defines a REAL LangGraph StateGraph, using LangChain's 
FakeListLLM to simulate LLM responses without needing an OpenAI key. 

It demonstrates how AgentGlass telemetry can be hooked directly into 
a real LangGraph workflow to trace the graph nodes as they execute.
"""

import argparse
import time
from typing import TypedDict, Annotated
from langchain_core.language_models import FakeListLLM
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from agentglass_python import AgentGlassClient
from agentglass_python.instrumentation import with_agentglass

# 1. Initialize AgentGlass Client
client = AgentGlassClient(daemon_url="http://127.0.0.1:8765", flush_interval_ms=100)

# 2. Define our Graph State
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]

# 3. Define our LangGraph Nodes, decorated with AgentGlass instrumentation
VARIANTS = {
    "a": {
        "query": "Research and summarize the integration of AgentGlass with LangGraph.",
        "researcher_response": (
            "Here is the research data: 1. LangGraph is a powerful orchestration framework. "
            "2. AgentGlass provides observability."
        ),
        "summarizer_response": (
            "Summary: LangGraph and AgentGlass work seamlessly together to build and monitor multi-agent workflows."
        ),
    },
    "b": {
        "query": "Explain how local-first observability helps debug multi-agent systems.",
        "researcher_response": (
            "Research notes: 1. Local traces avoid cloud egress. "
            "2. Time-travel debugging isolates cascading agent failures."
        ),
        "summarizer_response": (
            "Summary: Local-first observability keeps sensitive agent context on-machine while enabling deterministic replay."
        ),
    },
}


def build_nodes(client: AgentGlassClient, variant: str):
    config = VARIANTS[variant]

    @with_agentglass(client, name="Researcher")
    def researcher_node(state: AgentState):
        print("   > Running Researcher Node...")
        llm = FakeListLLM(responses=[config["researcher_response"]])
        response = llm.invoke(state["messages"])
        time.sleep(0.5)
        return {"messages": [response]}

    @with_agentglass(client, name="Summarizer")
    def summarizer_node(state: AgentState):
        print("   > Running Summarizer Node...")
        llm = FakeListLLM(responses=[config["summarizer_response"]])
        response = llm.invoke(state["messages"])
        time.sleep(0.5)
        return {"messages": [response]}

    return researcher_node, summarizer_node


def build_real_langgraph(client: AgentGlassClient, variant: str):
    researcher_node, summarizer_node = build_nodes(client, variant)

    workflow = StateGraph(AgentState)
    workflow.add_node("researcher", researcher_node)
    workflow.add_node("summarizer", summarizer_node)
    workflow.set_entry_point("researcher")
    workflow.add_edge("researcher", "summarizer")
    workflow.add_edge("summarizer", END)
    return workflow.compile()


def main():
    parser = argparse.ArgumentParser(description="AgentGlass canonical LangGraph interview demo")
    parser.add_argument(
        "--variant",
        choices=sorted(VARIANTS.keys()),
        default="a",
        help="Demo input variant (use two variants for trace compare)",
    )
    args = parser.parse_args()
    config = VARIANTS[args.variant]

    print("AgentGlass + Real LangGraph Demo\n")
    print(f"   Variant: {args.variant.upper()}\n")

    client.start_trace()
    graph = build_real_langgraph(client, args.variant)
    initial_state = {"messages": [HumanMessage(content=config["query"])]}

    print("Executing LangGraph flow...\n")
    result = graph.invoke(initial_state)

    print("\nExecution Complete.")
    print("Final Output:", result["messages"][-1].content)

    time.sleep(1.0)
    client.close()

    print("\nDone! Open http://localhost:3456/live to inspect this trace.")

if __name__ == "__main__":
    main()
