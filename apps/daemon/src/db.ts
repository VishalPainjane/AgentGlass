/**
 * AgentGlass Daemon — SQLite Persistence Layer
 *
 * Append-only event store using better-sqlite3.
 * DB file lives at `.agentglass/traces.db` relative to CWD
 * (or overridden via AGENTGLASS_DATA_DIR env var).
 */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

/* ------------------------------------------------------------------ */
/*  DB Location                                                       */
/* ------------------------------------------------------------------ */

export const dataDir = process.env.AGENTGLASS_DATA_DIR ?? join(process.cwd(), ".agentglass");
const dbPath = join(dataDir, "traces.db");

// Ensure directory exists
mkdirSync(dirname(dbPath), { recursive: true });

/* ------------------------------------------------------------------ */
/*  Types (mirror of schema v0)                                       */
/* ------------------------------------------------------------------ */

export interface PersistedEventRow {
  id: number;
  ingest_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  event_type: string;
  node_name: string;
  payload: string; // JSON string
  timestamp: number;
  ingest_timestamp: number;
  schema_version: string;
}

export interface TraceMetadataRow {
  trace_id: string;
  event_count: number;
  first_timestamp: number;
  last_timestamp: number;
  has_error: number; // SQLite boolean (0 | 1)
}

/* ------------------------------------------------------------------ */
/*  Initialise                                                        */
/* ------------------------------------------------------------------ */

const db = new Database(dbPath);

// WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ingest_id       TEXT    NOT NULL UNIQUE,
    trace_id        TEXT    NOT NULL,
    span_id         TEXT    NOT NULL,
    parent_span_id  TEXT,
    event_type      TEXT    NOT NULL,
    node_name       TEXT    NOT NULL DEFAULT '',
    payload         TEXT,
    timestamp       INTEGER NOT NULL,
    ingest_timestamp INTEGER NOT NULL,
    schema_version  TEXT    NOT NULL DEFAULT '0.1.0'
  );

  CREATE INDEX IF NOT EXISTS idx_events_trace     ON events(trace_id);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp  ON events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_events_span       ON events(span_id);
`);

/* ------------------------------------------------------------------ */
/*  Prepared Statements                                               */
/* ------------------------------------------------------------------ */

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO events (
    ingest_id, trace_id, span_id, parent_span_id,
    event_type, node_name, payload, timestamp,
    ingest_timestamp, schema_version
  ) VALUES (
    @ingest_id, @trace_id, @span_id, @parent_span_id,
    @event_type, @node_name, @payload, @timestamp,
    @ingest_timestamp, @schema_version
  )
`);

const queryEventsByTraceStmt = db.prepare(`
  SELECT * FROM events WHERE trace_id = ? ORDER BY timestamp ASC
`);

const queryRecentEventsStmt = db.prepare(`
  SELECT * FROM events ORDER BY timestamp DESC LIMIT ?
`);

const queryEventsSinceStmt = db.prepare(`
  SELECT * FROM events WHERE ingest_timestamp > ? ORDER BY timestamp ASC LIMIT 1000
`);

const queryTracesStmt = db.prepare(`
  SELECT
    trace_id,
    COUNT(*)                                        AS event_count,
    MIN(timestamp)                                  AS first_timestamp,
    MAX(timestamp)                                  AS last_timestamp,
    MAX(CASE WHEN event_type = 'error' THEN 1 ELSE 0 END) AS has_error
  FROM events
  GROUP BY trace_id
  ORDER BY MAX(timestamp) DESC
  LIMIT 100
`);

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

export function insertEvent(event: Omit<PersistedEventRow, "id">): boolean {
  const result = insertStmt.run(event);
  return result.changes > 0;
}

export function insertEventBatch(events: Omit<PersistedEventRow, "id">[]): Omit<PersistedEventRow, "id">[] {
  const inserted: Omit<PersistedEventRow, "id">[] = [];
  const transaction = db.transaction((rows: Omit<PersistedEventRow, "id">[]) => {
    for (const row of rows) {
      const result = insertStmt.run(row);
      if (result.changes > 0) {
        inserted.push(row);
      }
    }
  });
  transaction(events);
  return inserted;
}

export function getEventsByTrace(traceId: string): PersistedEventRow[] {
  return queryEventsByTraceStmt.all(traceId) as PersistedEventRow[];
}

export function getRecentEvents(limit: number = 200): PersistedEventRow[] {
  const rows = queryRecentEventsStmt.all(limit) as PersistedEventRow[];
  return rows.reverse(); // Return in chronological order
}

export function getEventsSince(sinceTimestamp: number): PersistedEventRow[] {
  return queryEventsSinceStmt.all(sinceTimestamp) as PersistedEventRow[];
}

export function getTraces(): TraceMetadataRow[] {
  return queryTracesStmt.all() as TraceMetadataRow[];
}

export function closeDb(): void {
  db.close();
}

export { dbPath };
