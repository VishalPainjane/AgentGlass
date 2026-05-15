"""
AgentGlass Demo — Real LangGraph + LangChain Integration

This script defines a REAL LangGraph StateGraph, using LangChain's 
FakeListLLM to simulate LLM responses without needing an OpenAI key. 

It demonstrates how AgentGlass telemetry can be hooked directly into 
a real LangGraph workflow to trace the graph nodes as they execute.
"""

from typing import TypedDict, Annotated
import time
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
@with_agentglass(client, name="Researcher")
def researcher_node(state: AgentState):
    print("   ▶ Running Researcher Node...")
    llm = FakeListLLM(responses=[
        "Here is the research data: 1. LangGraph is a powerful orchestration framework. 2. AgentGlass provides observability."
    ])
    
    # Run the "LLM"
    response = llm.invoke(state["messages"])
    time.sleep(0.5)
    return {"messages": [response]}

@with_agentglass(client, name="Summarizer")
def summarizer_node(state: AgentState):
    print("   ▶ Running Summarizer Node...")
    llm = FakeListLLM(responses=[
        "Summary: LangGraph and AgentGlass work seamlessly together to build and monitor multi-agent workflows."
    ])
    response = llm.invoke(state["messages"])
    time.sleep(0.5)
    return {"messages": [response]}

def build_real_langgraph():
    # Construct the graph
    workflow = StateGraph(AgentState)
    
    workflow.add_node("researcher", researcher_node)
    workflow.add_node("summarizer", summarizer_node)
    
    workflow.set_entry_point("researcher")
    workflow.add_edge("researcher", "summarizer")
    workflow.add_edge("summarizer", END)
    
    return workflow.compile()

def main():
    print("🔍 AgentGlass + Real LangGraph Demo\n")
    
    # Start the trace
    client.start_trace()
    
    # Build and run the graph
    graph = build_real_langgraph()
    
    initial_state = {"messages": [HumanMessage(content="Research and summarize the integration of AgentGlass with LangGraph.")]}
    
    print("Executing LangGraph flow...\n")
    result = graph.invoke(initial_state)
    
    print("\n✅ Execution Complete.")
    print("Final Output:", result["messages"][-1].content)
    
    # Wait a moment for async telemetry events to flush
    time.sleep(1.0)
    client.close()
    
    print("\n✨ Done! Open http://localhost:3456 to see the real LangGraph trace.")

if __name__ == "__main__":
    main()
