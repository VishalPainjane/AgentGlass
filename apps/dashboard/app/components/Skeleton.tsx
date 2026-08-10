"use client";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({
  width,
  height = 16,
  borderRadius = 4,
  className,
  style,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className || ""}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-card">
      <div className="skeleton-card-header">
        <Skeleton width={60} height={12} />
        <Skeleton width={40} height={12} />
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={`${85 - i * 10}%`}
          height={14}
          style={{ marginTop: 8 }}
        />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="skeleton-table">
      <div className="skeleton-table-header">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} width="80%" height={14} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="skeleton-table-row">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={colIndex} width={`${70 + Math.random() * 20}%`} height={14} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonGraph() {
  return (
    <div className="skeleton-graph">
      <div className="skeleton-graph-node" style={{ top: "20%", left: "15%" }}>
        <Skeleton width={120} height={60} borderRadius={8} />
      </div>
      <div className="skeleton-graph-node" style={{ top: "40%", left: "45%" }}>
        <Skeleton width={120} height={60} borderRadius={8} />
      </div>
      <div className="skeleton-graph-node" style={{ top: "60%", left: "75%" }}>
        <Skeleton width={120} height={60} borderRadius={8} />
      </div>
      <div className="skeleton-graph-edge" style={{ top: "35%", left: "25%" }} />
      <div className="skeleton-graph-edge" style={{ top: "55%", left: "55%" }} />
    </div>
  );
}