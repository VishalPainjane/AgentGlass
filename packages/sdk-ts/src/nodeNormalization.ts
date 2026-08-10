/**
 * Canonical node identity — normalize LangGraph / SDK naming variants
 * (e.g. policyretriever vs PolicyRetriever) to stable keys for analysis and UI.
 */

const CANONICAL_KEYS: Record<string, string> = {
  orchestrator: "orchestrator",
  policy_retriever: "policy_retriever",
  policyretriever: "policy_retriever",
  payment_analyzer: "payment_analyzer",
  paymentloganalyzer: "payment_analyzer",
  root_cause_analyst: "root_cause_analyst",
  rootcauseanalyst: "root_cause_analyst",
  compliance_validator: "compliance_validator",
  compliancevalidator: "compliance_validator",
  response_composer: "response_composer",
  responsecomposer: "response_composer",
  compliance_blocked: "compliance_blocked",
  paymentgateway: "compliance_blocked",
  langgraph: "langgraph",
};

const DISPLAY_NAMES: Record<string, string> = {
  orchestrator: "Orchestrator",
  policy_retriever: "PolicyRetriever",
  payment_analyzer: "PaymentLogAnalyzer",
  root_cause_analyst: "RootCauseAnalyst",
  compliance_validator: "ComplianceValidator",
  response_composer: "ResponseComposer",
  compliance_blocked: "PaymentGateway",
  langgraph: "LangGraph",
};

/** Ordered pipeline keys for the support-research demo workflow. */
export const SUPPORT_RESEARCH_PIPELINE_ORDER = [
  "orchestrator",
  "policy_retriever",
  "payment_analyzer",
  "root_cause_analyst",
  "compliance_validator",
  "response_composer",
  "compliance_blocked",
] as const;

export function canonicalNodeKey(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, "_");
  return CANONICAL_KEYS[normalized] ?? normalized;
}

export function canonicalNodeDisplayName(name: string): string {
  const key = canonicalNodeKey(name);
  return DISPLAY_NAMES[key] ?? name;
}
