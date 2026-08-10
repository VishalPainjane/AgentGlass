import asyncio
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_core.messages import HumanMessage
from langchain_ollama import ChatOllama

from agentglass_python import AgentGlassClient
from agentglass_python.langgraph_adapter import instrument_langgraph

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]

def call_model(state: AgentState):
    print("▶ Thinking (calling local Ollama: qwen3.6)...")
    # Using the local model tag we found from `ollama list`
    llm = ChatOllama(model="qwen3.6:latest", temperature=0.7)
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

def build_graph():
    workflow = StateGraph(AgentState)
    workflow.add_node("agent", call_model)
    workflow.set_entry_point("agent")
    workflow.add_edge("agent", END)
    return workflow.compile()

async def main():
    print("🚀 Starting Real Local LLM (Ollama) Test with AgentGlass...")
    client = AgentGlassClient(daemon_url="http://127.0.0.1:8765")
    
    app = build_graph()
    
    # Wrap the app with AgentGlass telemetry
    instrumented_app = instrument_langgraph(app, client)
    
    inputs = {"messages": [HumanMessage(content="Write a very short, 4-line poem about debugging software using time travel.")]}
    
    print("\nExecuting graph...")
    # Run the instrumented graph
    async for event in instrumented_app.astream(inputs, stream_mode="values"):
        if "messages" in event:
            last_message = event["messages"][-1]
            if last_message.type == "ai":
                print(f"\n🤖 Agent Output:\n{last_message.content}\n")
    
    # Give telemetry a moment to flush to the local daemon
    await asyncio.sleep(1.0)
    client.close()
    print("✅ Done! Go look at http://localhost:3456 to see the trace of this real LLM call.")

if __name__ == "__main__":
    asyncio.run(main())
