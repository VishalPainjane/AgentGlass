import type { TraceSummary } from "@agentglass/sdk-ts/browser";
import type { PersistedEvent, TraceMetadata } from "./eventHelpers";

export interface ShowcaseTraceRef {
  id: string;
  trace_id: string;
  label: string;
  default?: boolean;
}

export interface ShowcaseManifest {
  version: number;
  traces: ShowcaseTraceRef[];
  compare?: { left: string; right: string };
}

interface ShowcaseBundle {
  trace: TraceMetadata;
  events: PersistedEvent[];
}

let manifestPromise: Promise<ShowcaseManifest> | null = null;
let dataPromise: Promise<{
  events: PersistedEvent[];
  traces: TraceMetadata[];
  summaries: Record<string, TraceSummary>;
  defaultTraceId: string | null;
  compareTraceIds: { left: string | null; right: string | null };
}> | null = null;

async function fetchManifest(): Promise<ShowcaseManifest> {
  const res = await fetch("/showcase/manifest.json");
  if (!res.ok) {
    throw new Error(`Failed to load showcase manifest (${res.status})`);
  }
  return (await res.json()) as ShowcaseManifest;
}

async function fetchBundle(id: string): Promise<ShowcaseBundle> {
  const res = await fetch(`/showcase/${id}.json`);
  if (!res.ok) {
    throw new Error(`Failed to load showcase bundle "${id}" (${res.status})`);
  }
  return (await res.json()) as ShowcaseBundle;
}

export async function loadShowcaseData(): Promise<{
  events: PersistedEvent[];
  traces: TraceMetadata[];
  summaries: Record<string, TraceSummary>;
  defaultTraceId: string | null;
  compareTraceIds: { left: string | null; right: string | null };
}> {
  if (!dataPromise) {
    dataPromise = (async () => {
      const manifest = await fetchManifest();
      const bundles = await Promise.all(manifest.traces.map((t) => fetchBundle(t.id)));

      const events: PersistedEvent[] = [];
      const traces: TraceMetadata[] = [];
      const summaries: Record<string, TraceSummary> = {};

      for (const bundle of bundles) {
        events.push(...bundle.events);
        traces.push(bundle.trace);
        if (bundle.trace.summary) {
          summaries[bundle.trace.trace_id] = bundle.trace.summary;
        }
      }

      const defaultRef =
        manifest.traces.find((t) => t.default) ?? manifest.traces[0] ?? null;

      const leftRef = manifest.compare
        ? manifest.traces.find((t) => t.id === manifest.compare!.left)
        : undefined;
      const rightRef = manifest.compare
        ? manifest.traces.find((t) => t.id === manifest.compare!.right)
        : undefined;

      return {
        events,
        traces,
        summaries,
        defaultTraceId: defaultRef?.trace_id ?? null,
        compareTraceIds: {
          left: leftRef?.trace_id ?? null,
          right: rightRef?.trace_id ?? null,
        },
      };
    })();
  }

  return dataPromise;
}

export function getShowcaseManifest(): Promise<ShowcaseManifest> {
  if (!manifestPromise) {
    manifestPromise = fetchManifest();
  }
  return manifestPromise;
}
