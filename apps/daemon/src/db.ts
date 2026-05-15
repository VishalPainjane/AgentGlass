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

export interface RcaResultRow {
  trace_id: string;
  span_id: string;
  analysis: string;
  created_at: number;
}

export interface CommandRow {
  id: string;
  trace_id: string;
  target_span: string | null;
  command_type: string;
  payload: string;
  status: "pending" | "acknowledged" | "completed" | "failed";
  created_at: number;
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

  CREATE TABLE IF NOT EXISTS rca_results (
    trace_id    TEXT NOT NULL,
    span_id     TEXT NOT NULL,
    analysis    TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (trace_id, span_id)
  );

  CREATE TABLE IF NOT EXISTS commands (
    id            TEXT PRIMARY KEY,
    trace_id      TEXT NOT NULL,
    target_span   TEXT,
    command_type  TEXT NOT NULL,
    payload       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    created_at    INTEGER NOT NULL
  );
  
  CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(trace_id, status);
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

const queryCacheableEventsStmt = db.prepare(`
  SELECT * FROM events 
  WHERE event_type IN ('llm_request', 'llm_response', 'tool_result') 
  ORDER BY timestamp DESC 
  LIMIT 500
`);

const clearAllEventsStmt = db.prepare(`DELETE FROM events`);
const clearAllRcaStmt = db.prepare(`DELETE FROM rca_results`);
const clearAllCommandsStmt = db.prepare(`DELETE FROM commands`);

const insertRcaResultStmt = db.prepare(`
  INSERT OR REPLACE INTO rca_results (trace_id, span_id, analysis, created_at)
  VALUES (@trace_id, @span_id, @analysis, @created_at)
`);

const queryRcaResultStmt = db.prepare(`
  SELECT * FROM rca_results WHERE trace_id = ? AND span_id = ?
`);

const insertCommandStmt = db.prepare(`
  INSERT INTO commands (id, trace_id, target_span, command_type, payload, status, created_at)
  VALUES (@id, @trace_id, @target_span, @command_type, @payload, @status, @created_at)
`);

const queryPendingCommandsStmt = db.prepare(`
  SELECT * FROM commands WHERE trace_id = ? AND target_span = ? AND status = 'pending' ORDER BY created_at ASC
`);

const updateCommandStatusStmt = db.prepare(`
  UPDATE commands SET status = @status WHERE id = @id
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

export function getCacheableEvents(): PersistedEventRow[] {
  return queryCacheableEventsStmt.all() as PersistedEventRow[];
}

export function insertRcaResult(traceId: string, spanId: string, analysis: string): void {
  insertRcaResultStmt.run({
    trace_id: traceId,
    span_id: spanId,
    analysis,
    created_at: Date.now() * 1000
  });
}

export function getRcaResult(traceId: string, spanId: string): RcaResultRow | undefined {
  return queryRcaResultStmt.get(traceId, spanId) as RcaResultRow | undefined;
}

export function insertCommand(cmd: Omit<CommandRow, "status" | "created_at">): void {
  insertCommandStmt.run({
    ...cmd,
    status: 'pending',
    created_at: Date.now() * 1000
  });
}

export function getPendingCommands(traceId: string, targetSpan: string): CommandRow[] {
  return queryPendingCommandsStmt.all(traceId, targetSpan) as CommandRow[];
}

export function updateCommandStatus(id: string, status: CommandRow["status"]): void {
  updateCommandStatusStmt.run({ id, status });
}

export function clearDatabase(): void {
  const transaction = db.transaction(() => {
    clearAllEventsStmt.run();
    clearAllRcaStmt.run();
    clearAllCommandsStmt.run();
  });
  transaction();
}

export function closeDb(): void {
  db.close();
}

export { dbPath };
