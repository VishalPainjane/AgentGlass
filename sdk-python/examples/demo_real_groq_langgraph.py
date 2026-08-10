import asyncio
import os
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_core.messages import HumanMessage
from langchain_groq import ChatGroq
from langchain_core.tools import tool

from agentglass_python import AgentGlassClient
from agentglass_python.langgraph_adapter import instrument_langgraph

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]

# Define a real tool!
@tool
def calculate_future_year(years_ahead: int) -> int:
    """Calculates what year it will be in the future."""
    current_year = 2026
    return current_year + years_ahead

def build_graph():
    # 1. Initialize the real LLM and bind the tool
    # llama-3.3-70b-versatile is excellent at tool calling and very fast
    llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0)
    tools = [calculate_future_year]
    llm_with_tools = llm.bind_tools(tools)

    # 2. Define the agent node
    def call_model(state: AgentState):
        print("▶ Thinking (calling Groq Llama 3.3)...")
        response = llm_with_tools.invoke(state["messages"])
        return {"messages": [response]}

    # 3. Build the LangGraph
    workflow = StateGraph(AgentState)
    
    workflow.add_node("agent", call_model)
    workflow.add_node("tools", ToolNode(tools))
    
    workflow.set_entry_point("agent")
    
    # tools_condition routes to "tools" if the LLM called a tool, otherwise ends.
    workflow.add_conditional_edges("agent", tools_condition)
    workflow.add_edge("tools", "agent")
    
    return workflow.compile()

async def main():
    print("🚀 Starting Real Local LLM (Groq) Test with AgentGlass...")
    
    # Make sure we have the API key set for the script to use
    if not os.environ.get("GROQ_API_KEY"):
        raise ValueError("GROQ_API_KEY environment variable is not set!")

    client = AgentGlassClient(daemon_url="http://127.0.0.1:8765")
    
    app = build_graph()
    
    # Wrap the app with AgentGlass telemetry
    instrumented_app = instrument_langgraph(app, client)
    
    # A prompt that requires the LLM to use the tool
    prompt = "I plan to time travel 42 years into the future from today. Use your tool to calculate the year, then write a 2-line poem about arriving in that exact year."
    inputs = {"messages": [HumanMessage(content=prompt)]}
    
    print("\nExecuting graph...")
    # Run the instrumented graph
    async for event in instrumented_app.astream(inputs, stream_mode="values"):
        if "messages" in event:
            last_message = event["messages"][-1]
            if last_message.type == "ai" and not last_message.tool_calls:
                print(f"\n🤖 Final Agent Output:\n{last_message.content}\n")
            elif last_message.type == "tool":
                print(f"🔧 Tool Execution Result: {last_message.content}")
    
    # Give telemetry a moment to flush to the local daemon
    await asyncio.sleep(1.0)
    client.close()
    print("✅ Done! Go look at http://localhost:3456 to see the trace of this real Groq LLM call.")

if __name__ == "__main__":
    asyncio.run(main())
