"""
AgentGlass Test — Automatic LangGraph Instrumentation

Verifies that instrument_langgraph correctly captures node transitions
using LangChain callbacks without manual @with_agentglass decorators.
"""

from typing import TypedDict, Annotated
import time
from langchain_core.language_models import FakeListLLM
from langchain_core.messages import BaseMessage, HumanMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from agentglass_python import AgentGlassClient
from agentglass_python.langgraph_adapter import instrument_langgraph

# 1. Initialize AgentGlass Client
client = AgentGlassClient(daemon_url="http://127.0.0.1:8765", flush_interval_ms=100)

# 2. Define our Graph State
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]

# 3. Define our LangGraph Nodes (NO decorators here)
def researcher_node(state: AgentState):
    print("   ▶ Running Researcher Node...")
    llm = FakeListLLM(responses=["Research data: LangGraph is great."])
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

def summarizer_node(state: AgentState):
    print("   ▶ Running Summarizer Node...")
    llm = FakeListLLM(responses=["Summary: Done."])
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

def main():
    print("🔍 Testing Automatic LangGraph Instrumentation\n")
    
    # Construct the graph
    workflow = StateGraph(AgentState)
    workflow.add_node("researcher", researcher_node)
    workflow.add_node("summarizer", summarizer_node)
    workflow.set_entry_point("researcher")
    workflow.add_edge("researcher", "summarizer")
    workflow.add_edge("summarizer", END)
    
    graph = workflow.compile()
    
    # 4. Instrument the graph
    graph = instrument_langgraph(graph, client)
    
    initial_state = {"messages": [HumanMessage(content="Test automatic instrumentation.")]}
    
    print("Executing LangGraph flow...\n")
    result = graph.invoke(initial_state)
    
    print("\n✅ Execution Complete.")
    
    # Wait for flush
    time.sleep(1.0)
    client.close()

if __name__ == "__main__":
    main()
