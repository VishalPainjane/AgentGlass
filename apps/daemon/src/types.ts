import { z } from "zod";
import type { PersistedEventRow } from "./db";

export const SCHEMA_VERSION = "0.1.0" as const;

export const IncomingEventSchema = z.object({
  event_id: z.string().optional(),
  trace_id: z.string().min(1),
  span_id: z.string().min(1),
  parent_span_id: z.string().min(1).nullish(),
  event_type: z.string().min(1),
  node_name: z.string().default(""),
  payload: z.record(z.unknown()).nullable().optional().transform((val) => val ?? {}),
  timestamp: z.number().int().nonnegative().optional(),
  schema_version: z.string().default(SCHEMA_VERSION),
});

export type IncomingEvent = z.infer<typeof IncomingEventSchema>;

export interface ParsedUrl {
  pathname: string;
  searchParams: URLSearchParams;
}

export function parseUrl(rawUrl: string | undefined): ParsedUrl {
  const url = new URL(rawUrl ?? "/", "http://localhost");
  return { pathname: url.pathname, searchParams: url.searchParams };
}

export function rowToJson(row: PersistedEventRow): Record<string, unknown> {
  return {
    ...row,
    payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
  };
}

export function sendJson(
  res: import("node:http").ServerResponse,
  statusCode: number,
  payload: unknown,
  headers: Record<string, string> = {}
): void {
  const defaultHeaders = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    ...headers,
  };
  res.writeHead(statusCode, defaultHeaders);
  res.end(JSON.stringify(payload));
}

export async function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += String(chunk);
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}