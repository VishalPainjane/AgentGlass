"""
AgentGlass VCR Cache Demo

This script demonstrates how to wrap LLM calls with the VCR Cache for "Zero-Cost Debugging".
The first run will simulate an API call (sleep) and cache the result.
The second run will instantly return the cached result.
"""

import time
import os
from uuid import uuid4

from agentglass_python import AgentGlassClient, VCRCache, agentglass_vcr

# 1. Initialize the client and cache
client = AgentGlassClient(daemon_url="http://127.0.0.1:7777", flush_interval_ms=100)
vcr = VCRCache(db_path=".agentglass/vcr_cache.db", mode="auto")

# 2. Define a dummy LLM function wrapped with the @agentglass_vcr decorator
@agentglass_vcr(vcr, client=client, model_arg="model")
def call_llm(model: str, messages: list[dict]):
    print(f"   [NETWORK] Calling real {model} API (sleeping for 2 seconds)...")
    time.sleep(2)
    return {
        "id": "chatcmpl-123",
        "object": "chat.completion",
        "model": model,
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": f"Here is the simulated response for your {len(messages)} messages."
            },
            "finish_reason": "stop"
        }]
    }

def main():
    print("\n🔍 AgentGlass VCR Cache Demo\n")
    
    # Start a trace
    client.start_trace()
    
    # Define a prompt
    prompt = [{"role": "user", "content": "Explain quantum gravity in 5 sentences."}]
    
    print("▶ Run 1: Should call the API and cache it")
    start = time.time()
    resp1 = call_llm(model="gpt-4", messages=prompt)
    print(f"   Time taken: {time.time() - start:.2f}s")
    
    print("\n▶ Run 2: Exact same prompt. Should instantly return from cache")
    start = time.time()
    resp2 = call_llm(model="gpt-4", messages=prompt)
    print(f"   Time taken: {time.time() - start:.2f}s")
    
    print("\n▶ Run 3: Changed prompt. Should bypass cache and call API")
    changed_prompt = [{"role": "user", "content": "Explain black holes in 2 sentences."}]
    start = time.time()
    resp3 = call_llm(model="gpt-4", messages=changed_prompt)
    print(f"   Time taken: {time.time() - start:.2f}s")

    # Flush events
    time.sleep(0.5)
    client.close()
    
    print("\n✨ Done! You can verify in the dashboard that 'call_llm' generated llm_request/llm_response events.")
    print("Run `agentglass cache clear` to wipe the cache database.")

if __name__ == "__main__":
    main()
