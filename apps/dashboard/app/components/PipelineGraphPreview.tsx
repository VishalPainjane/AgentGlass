/**
 * Static pipeline preview for the landing page — shows the graph story without a live daemon.
 */

const PIPELINE = [
  "Orchestrator",
  "PolicyRetriever",
  "PaymentLogAnalyzer",
  "RootCauseAnalyst",
  "ComplianceValidator",
  "ResponseComposer",
];

export default function PipelineGraphPreview() {
  return (
    <div className="pipeline-graph-preview" aria-hidden>
      <svg viewBox="0 0 720 280" className="pipeline-graph-preview-svg">
        <defs>
          <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {PIPELINE.map((label, i) => {
          const x = 60 + i * 108;
          const y = 120;
          const isLast = i === PIPELINE.length - 1;
          const nextX = 60 + (i + 1) * 108;

          return (
            <g key={label}>
              {!isLast && (
                <line
                  x1={x + 44}
                  y1={y}
                  x2={nextX - 44}
                  y2={y}
                  stroke="url(#edgeGrad)"
                  strokeWidth="2"
                  markerEnd="url(#arrow)"
                />
              )}
              <rect
                x={x - 44}
                y={y - 28}
                width="88"
                height="56"
                rx="10"
                fill="rgba(16, 185, 129, 0.08)"
                stroke="rgba(52, 211, 153, 0.45)"
                strokeWidth="1.5"
              />
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fill="#a7f3d0"
                fontSize="9"
                fontFamily="ui-monospace, monospace"
              >
                {label}
              </text>
            </g>
          );
        })}

        <text x="360" y="220" textAnchor="middle" fill="#64748b" fontSize="12" fontFamily="ui-monospace, monospace">
          Live LangGraph pipeline · click a node to inspect LLM calls
        </text>
      </svg>
    </div>
  );
}
