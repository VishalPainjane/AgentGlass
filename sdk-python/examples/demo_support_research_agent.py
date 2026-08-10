"""
AgentGlass Demo — REAL Enterprise Support Research Agent

This is NOT a telemetry simulator. It runs a genuine LangGraph StateGraph where:
  - Policy retrieval uses real TF-IDF search over an in-memory document corpus
  - Payment analysis runs real filtering/aggregation over structured log data
  - Compliance validation is real Python logic (not scripted pass/fail)
  - LLM steps call a real model when credentials are available

LLM provider (first match wins):
  1. OPENAI_API_KEY  -> ChatOpenAI (gpt-4o-mini)
  2. GROQ_API_KEY    -> ChatGroq (llama-3.3-70b-versatile)
  3. Local Ollama    -> ChatOllama (llama3.2 or OLLAMA_MODEL env)
  4. Fallback        -> FakeListLLM (graph + tools still execute for real)

Variant A: full compliance corpus -> high retrieval scores -> validator passes
Variant B: FAQ-only corpus -> weak retrieval -> validator fails on real checks

Usage:
  python examples/demo_support_research_agent.py
  python examples/demo_support_research_agent.py --variant b
  GROQ_API_KEY=... python examples/demo_support_research_agent.py
"""

from __future__ import annotations

import argparse
import math
import os
import re
import time
from collections import Counter
from typing import Annotated, Any, Literal, TypedDict

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages

from agentglass_python import AgentGlassClient
from agentglass_python.langgraph_adapter import instrument_langgraph
from agentglass_python.rag import log_retrieval

# ---------------------------------------------------------------------------
# Real data — not hardcoded telemetry payloads
# ---------------------------------------------------------------------------

QUERY = "Why are EU customer refund requests failing since March 2026?"

FULL_POLICY_CORPUS: list[dict[str, Any]] = [
    {
        "text": (
            "EU GDPR Article 17 requires customer PII to be deleted after 90 days. "
            "Refund processing requires active billing records. If retention expired, "
            "refunds cannot be matched to original transactions."
        ),
        "source": "compliance/eu-gdpr-retention-policy.pdf",
        "metadata": {"page": 14, "section": "Data Retention", "owner": "legal"},
    },
    {
        "text": (
            "Stripe webhook refunds.refund.updated returns error code "
            "charge_already_refunded when duplicate refund attempts are made "
            "within the same billing cycle."
        ),
        "source": "runbooks/stripe-refund-errors.md",
        "metadata": {"author": "payments-team"},
    },
    {
        "text": (
            "March 2026 migration moved EU billing data to eu-west-1. "
            "Cross-region replication lag can delay refund eligibility checks by up to 4 hours."
        ),
        "source": "postmortems/2026-03-eu-migration.md",
        "metadata": {"severity": "P2"},
    },
]

WEAK_POLICY_CORPUS: list[dict[str, Any]] = [
    {
        "text": "General refund policy: all customers may request refunds within 30 days of purchase.",
        "source": "faq/customer-refunds.html",
        "metadata": {"page": 1},
    },
    {
        "text": "US customers can contact support@example.com for billing issues.",
        "source": "faq/us-billing.md",
        "metadata": {"region": "US"},
    },
]

PAYMENT_LOGS: list[dict[str, Any]] = [
    {"txn_id": "txn_8f2a", "region": "EU", "error": "GDPR_RETENTION_EXPIRED", "amount": 49.99, "days_ago": 2},
    {"txn_id": "txn_9b11", "region": "EU", "error": "GDPR_RETENTION_EXPIRED", "amount": 120.00, "days_ago": 3},
    {"txn_id": "txn_c403", "region": "EU", "error": "GDPR_RETENTION_EXPIRED", "amount": 29.99, "days_ago": 5},
    {"txn_id": "txn_d901", "region": "EU", "error": "GDPR_RETENTION_EXPIRED", "amount": 89.50, "days_ago": 6},
    {"txn_id": "txn_us01", "region": "US", "error": "CARD_DECLINED", "amount": 15.00, "days_ago": 1},
]


# ---------------------------------------------------------------------------
# Real retrieval + log analysis (stdlib only)
# ---------------------------------------------------------------------------

def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def vector_search(query: str, corpus: list[dict[str, Any]], top_k: int = 3) -> list[dict[str, Any]]:
    """Real TF-IDF-style scoring over the corpus. Returns ranked chunks with scores."""
    query_tokens = Counter(_tokenize(query))
    if not query_tokens:
        return []

    doc_freq: Counter[str] = Counter()
    tokenized_docs: list[list[str]] = []
    for doc in corpus:
        tokens = _tokenize(doc["text"])
        tokenized_docs.append(tokens)
        for token in set(tokens):
            doc_freq[token] += 1

    n_docs = len(corpus)
    scored: list[dict[str, Any]] = []

    for doc, tokens in zip(corpus, tokenized_docs):
        if not tokens:
            continue
        tf = Counter(tokens)
        score = 0.0
        for token, q_count in query_tokens.items():
            if token not in tf:
                continue
            idf = math.log((1 + n_docs) / (1 + doc_freq[token])) + 1
            score += (tf[token] / len(tokens)) * idf * q_count
        scored.append({**doc, "score": round(min(score, 1.0), 3)})

    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:top_k]


def query_payment_logs(region: str, window_days: int = 7) -> dict[str, Any]:
    """Real aggregation over structured payment log records."""
    filtered = [
        row for row in PAYMENT_LOGS if row["region"] == region and row["days_ago"] <= window_days
    ]
    if not filtered:
        return {"failed_refunds_7d": 0, "top_error": None, "affected_region": region, "sample_transaction_ids": []}

    error_counts = Counter(row["error"] for row in filtered)
    top_error, _ = error_counts.most_common(1)[0]
    return {
        "failed_refunds_7d": len(filtered),
        "top_error": top_error,
        "affected_region": region,
        "sample_transaction_ids": [row["txn_id"] for row in filtered[:3]],
        "error_breakdown": dict(error_counts),
    }


def validate_compliance(
    conclusion: str,
    policy_chunks: list[dict[str, Any]],
    log_findings: dict[str, Any],
) -> dict[str, Any]:
    """Real validator — checks evidence quality and consistency with logs."""
    top_score = max((chunk.get("score", 0) for chunk in policy_chunks), default=0.0)
    conclusion_lower = conclusion.lower()
    top_error = (log_findings.get("top_error") or "").lower().replace("_", " ")

    checks = {
        "policy_evidence_strong": top_score >= 0.15,
        "mentions_retention_or_gdpr": any(
            term in conclusion_lower for term in ("gdpr", "retention", "billing record", "pii")
        ),
        "explains_log_error": top_error in conclusion_lower or "retention" in conclusion_lower,
        "actionable_recommendation": any(
            term in conclusion_lower for term in ("extend", "fix", "check", "recommend", "should")
        ),
    }
    passed = all(checks.values())
    failed = [name for name, ok in checks.items() if not ok]

    return {
        "approved": passed,
        "checks": checks,
        "failed_checks": failed,
        "confidence": round(top_score * (0.9 if passed else 0.4), 2),
        "top_retrieval_score": top_score,
    }


# ---------------------------------------------------------------------------
# LLM provider selection — Ollama first (local), API keys as override/fallback
# ---------------------------------------------------------------------------

def _ollama_bin() -> str:
    """Resolve ollama CLI — Windows install path or PATH."""
    if os.environ.get("OLLAMA_BIN"):
        return os.environ["OLLAMA_BIN"]
    if os.name == "nt":
        local = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Ollama", "ollama.exe")
        if os.path.isfile(local):
            return local
    return "ollama"


def _ollama_available() -> tuple[str, str] | None:
    """Return (host, model) if Ollama is reachable and the model exists or can be pulled."""
    import httpx

    host = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
    model = os.environ.get("OLLAMA_MODEL", "llama3.2:1b")
    try:
        response = httpx.get(f"{host}/api/tags", timeout=3.0)
        if response.status_code != 200:
            return None
        tags = response.json().get("models", [])
        installed = {m.get("name", "").split(":")[0] for m in tags}
        base_model = model.split(":")[0]
        if base_model not in installed and model not in {m.get("name") for m in tags}:
            print(f"[AgentGlass] Pulling Ollama model '{model}' (first run may take a few minutes)...")
            import subprocess

            subprocess.run([_ollama_bin(), "pull", model], check=True, timeout=900)
        return host, model
    except Exception:
        return None


def resolve_llm(variant: str) -> tuple[BaseChatModel, str]:
    """Pick LLM: explicit override -> Ollama (local) -> Groq -> OpenAI -> FakeListLLM."""
    provider = os.environ.get("AGENTGLASS_LLM_PROVIDER", "").lower().strip()

    if provider in ("openai", "groq", "ollama", "fake"):
        pass  # handled below in order
    elif provider:
        print(f"[AgentGlass] Unknown AGENTGLASS_LLM_PROVIDER='{provider}', using auto-detect.")

    def _openai() -> tuple[BaseChatModel, str]:
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"), temperature=0), "openai"

    def _groq() -> tuple[BaseChatModel, str]:
        from langchain_groq import ChatGroq

        return ChatGroq(model=os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"), temperature=0), "groq"

    def _ollama() -> tuple[BaseChatModel, str]:
        from langchain_ollama import ChatOllama

        info = _ollama_available()
        if not info:
            raise RuntimeError("Ollama is not running. Start it with: ollama serve")
        host, model = info
        return ChatOllama(model=model, base_url=host, temperature=0), f"ollama:{model}"

    # Explicit provider override
    if provider == "openai" and os.environ.get("OPENAI_API_KEY"):
        return _openai()
    if provider == "groq" and os.environ.get("GROQ_API_KEY"):
        return _groq()
    if provider == "ollama":
        return _ollama()
    if provider == "fake":
        pass  # fall through to FakeListLLM below

    # Default order: Ollama (local) -> Groq -> OpenAI -> FakeListLLM
    if provider != "fake":
        try:
            return _ollama()
        except Exception as exc:
            print(f"[AgentGlass] Ollama unavailable ({exc}). Trying API providers...")

    if os.environ.get("GROQ_API_KEY"):
        return _groq()

    if os.environ.get("OPENAI_API_KEY"):
        return _openai()

    from langchain_core.language_models import FakeListLLM

    if variant == "a":
        responses = [
            (
                "Root cause: EU customer billing records were purged after the 90-day GDPR retention "
                "window, so the refund service cannot locate the original charge. The March eu-west-1 "
                "migration amplified the issue by adding replication lag to eligibility checks. "
                "Recommend extending refund-eligible record retention to 180 days for EU tenants."
            ),
            (
                "We identified that EU refunds are failing because billing records expire after 90 days "
                "under GDPR retention policy. Recommended fix: extend refund-eligible record retention "
                "to 180 days for EU tenants and add a pre-refund eligibility check."
            ),
        ]
    else:
        responses = [
            (
                "Likely cause: customers are outside the 30-day refund window. "
                "Recommend sending the standard FAQ response."
            ),
        ]

    print(
        "\n[AgentGlass] No Ollama, GROQ_API_KEY, or OPENAI_API_KEY available.\n"
        "             Using FakeListLLM for text generation ONLY.\n"
        "             Retrieval, log analysis, and validation still run for real.\n"
        "             Install Ollama: https://ollama.com/download\n"
        "             Or set GROQ_API_KEY / OPENAI_API_KEY for cloud LLM.\n"
    )
    return FakeListLLM(responses=responses), "fake-list-llm"


def _llm_text(response: Any) -> str:
    if isinstance(response, str):
        return response
    content = getattr(response, "content", None)
    return str(content) if content is not None else str(response)


def _as_ai_message(response: Any) -> AIMessage:
    if isinstance(response, AIMessage):
        return response
    return AIMessage(content=_llm_text(response))


def _last_ai_content(messages: list[BaseMessage]) -> str:
    for message in reversed(messages):
        if isinstance(message, AIMessage) and message.content:
            return str(message.content)
    return ""


# ---------------------------------------------------------------------------
# LangGraph state + nodes
# ---------------------------------------------------------------------------

class SupportState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    query: str
    variant: str
    plan: list[str]
    policy_chunks: list[dict[str, Any]]
    log_findings: dict[str, Any]
    llm_conclusion: str
    validation: dict[str, Any]
    final_response: str | None


def build_graph(client: AgentGlassClient, variant: Literal["a", "b"], llm: BaseChatModel):
    corpus = FULL_POLICY_CORPUS if variant == "a" else WEAK_POLICY_CORPUS

    def orchestrator(state: SupportState) -> dict[str, Any]:
        print("[1/6] Orchestrator — building investigation plan...")
        plan = [
            "Retrieve EU compliance policy context",
            "Query payment failure logs (last 7 days)",
            "Synthesize root cause with LLM",
            "Validate against compliance rules",
            "Compose customer response",
        ]
        return {
            "plan": plan,
            "messages": [
                SystemMessage(content=f"Investigation plan: {'; '.join(plan)}"),
            ],
        }

    def policy_retriever(state: SupportState) -> dict[str, Any]:
        print("[2/6] PolicyRetriever — running vector search over compliance corpus...")
        chunks = vector_search(state["query"], corpus, top_k=3)
        log_retrieval(
            client,
            query=state["query"],
            results=chunks,
            node_name="PolicyRetriever",
        )
        summary = f"Retrieved {len(chunks)} chunks; top score={chunks[0]['score'] if chunks else 0}"
        return {
            "policy_chunks": chunks,
            "messages": [AIMessage(content=summary)],
        }

    def payment_analyzer(state: SupportState) -> dict[str, Any]:
        print("[3/6] PaymentLogAnalyzer — aggregating EU refund failures...")
        findings = query_payment_logs(region="EU", window_days=7)
        return {
            "log_findings": findings,
            "messages": [
                AIMessage(
                    content=(
                        f"Found {findings['failed_refunds_7d']} failed EU refunds; "
                        f"top error: {findings['top_error']}"
                    )
                )
            ],
        }

    def root_cause_analyst(state: SupportState) -> dict[str, Any]:
        print("[4/6] RootCauseAnalyst — calling LLM with policy + log context...")
        policy_text = "\n".join(
            f"- ({chunk['score']}) {chunk['text'][:200]}..." for chunk in state["policy_chunks"]
        )
        logs = state["log_findings"]
        prompt = (
            f"Customer query: {state['query']}\n\n"
            f"Policy context:\n{policy_text}\n\n"
            f"Payment logs: {logs['failed_refunds_7d']} failures, "
            f"top error: {logs['top_error']}\n\n"
            "What is the root cause? Be specific about GDPR/retention if relevant."
        )
        response = llm.invoke([HumanMessage(content=prompt)])
        conclusion = _llm_text(response)
        return {
            "llm_conclusion": conclusion,
            "messages": [_as_ai_message(response)],
        }

    def compliance_validator(state: SupportState) -> dict[str, Any]:
        print("[5/6] ComplianceValidator — running compliance checks...")
        validation = validate_compliance(
            state["llm_conclusion"],
            state["policy_chunks"],
            state["log_findings"],
        )
        status = "approved" if validation["approved"] else "rejected"
        return {
            "validation": validation,
            "messages": [AIMessage(content=f"Compliance validation {status}: {validation}")],
        }

    def response_composer(state: SupportState) -> dict[str, Any]:
        print("[6/6] ResponseComposer — drafting customer response...")
        prompt = (
            f"Draft a concise technical response for an enterprise customer.\n"
            f"Root cause analysis:\n{state['llm_conclusion']}\n"
            f"Include recommended actions."
        )
        response = llm.invoke([HumanMessage(content=prompt)])
        return {
            "final_response": _llm_text(response),
            "messages": [_as_ai_message(response)],
        }

    def compliance_blocked(state: SupportState) -> dict[str, Any]:
        print("[6/6] PaymentGateway — blocked by compliance failure...")
        validation = state["validation"]
        error_msg = (
            f"ComplianceValidator rejected response: {validation.get('failed_checks')}. "
            "Human review required."
        )
        client.track_event(
            event_type="error",
            node_name="PaymentGateway",
            payload={
                "message": error_msg,
                "type": "ComplianceBlocked",
                "failed_checks": validation.get("failed_checks"),
                "top_retrieval_score": validation.get("top_retrieval_score"),
                "validation": validation,
            },
        )
        return {
            "final_response": None,
            "messages": [AIMessage(content=error_msg)],
        }

    def route_after_validation(state: SupportState) -> str:
        return "response_composer" if state["validation"].get("approved") else "compliance_blocked"

    workflow = StateGraph(SupportState)
    workflow.add_node("orchestrator", orchestrator)
    workflow.add_node("policy_retriever", policy_retriever)
    workflow.add_node("payment_analyzer", payment_analyzer)
    workflow.add_node("root_cause_analyst", root_cause_analyst)
    workflow.add_node("compliance_validator", compliance_validator)
    workflow.add_node("response_composer", response_composer)
    workflow.add_node("compliance_blocked", compliance_blocked)

    workflow.set_entry_point("orchestrator")
    workflow.add_edge("orchestrator", "policy_retriever")
    workflow.add_edge("policy_retriever", "payment_analyzer")
    workflow.add_edge("payment_analyzer", "root_cause_analyst")
    workflow.add_edge("root_cause_analyst", "compliance_validator")
    workflow.add_conditional_edges("compliance_validator", route_after_validation)
    workflow.add_edge("response_composer", END)
    workflow.add_edge("compliance_blocked", END)

    return workflow.compile()


def main() -> None:
    parser = argparse.ArgumentParser(description="REAL LangGraph support research agent for AgentGlass")
    parser.add_argument(
        "--variant",
        choices=["a", "b"],
        default="a",
        help="a = full corpus (success), b = weak corpus (compliance failure)",
    )
    args = parser.parse_args()

    client = AgentGlassClient(daemon_url="http://127.0.0.1:8765", flush_interval_ms=80)
    llm, provider = resolve_llm(args.variant)

    print(f"\n{'=' * 60}")
    print("  Enterprise Support Research Agent  (REAL LangGraph)")
    print(f"  Variant {args.variant.upper()} | LLM provider: {provider}")
    print(f"{'=' * 60}")
    print(f"\nCustomer query: {QUERY}\n")

    trace_id = client.start_trace()
    graph = build_graph(client, args.variant, llm)
    instrumented = instrument_langgraph(graph, client, trace_id=trace_id, llm_label=provider)

    initial_state: SupportState = {
        "messages": [HumanMessage(content=QUERY)],
        "query": QUERY,
        "variant": args.variant,
        "plan": [],
        "policy_chunks": [],
        "log_findings": {},
        "llm_conclusion": "",
        "validation": {},
        "final_response": None,
    }

    result = instrumented.invoke(initial_state)

    print("\n--- Execution result ---")
    print(f"Top retrieval score: {result['policy_chunks'][0]['score'] if result['policy_chunks'] else 'n/a'}")
    print(f"Failed refunds (EU): {result['log_findings'].get('failed_refunds_7d')}")
    print(f"Validator approved: {result['validation'].get('approved')}")
    if result.get("final_response"):
        print(f"\nCustomer response:\n{result['final_response']}")
    else:
        print(f"\nBlocked: {_last_ai_content(result['messages'])}")

    time.sleep(2.0)
    client.close()

    print(f"\nTrace ID: {trace_id}")
    print("Open http://localhost:3456/live — telemetry came from real graph execution.\n")


if __name__ == "__main__":
    main()
