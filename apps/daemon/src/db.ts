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
import { computeOverallScore, computeOverallPassed, type TraceEvaluation } from "@agentglass/sdk-ts";

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

export interface TraceSummaryRow {
  trace_id: string;
  summary_json: string;
  updated_at: number;
}

export interface EvaluationScoreRow {
  trace_id: string;
  evaluator: string;
  name: string;
  available: number;
  value: number | null;
  passed: number | null;
  explanation: string | null;
  evaluated_at: number;
  evaluator_type: string | null;
  scope: string | null;
  version: string | null;
  pass_condition: string | null;
  metadata_json: string | null;
  provider: string | null;
  model: string | null;
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

  CREATE TABLE IF NOT EXISTS trace_summaries (
    trace_id      TEXT PRIMARY KEY,
    summary_json  TEXT NOT NULL,
    updated_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS evaluation_scores (
    trace_id      TEXT NOT NULL,
    evaluator     TEXT NOT NULL,
    name          TEXT NOT NULL,
    available     INTEGER NOT NULL DEFAULT 1,
    value         REAL,
    passed        INTEGER,
    explanation   TEXT,
    evaluated_at  INTEGER NOT NULL,
    PRIMARY KEY (trace_id, evaluator)
  );

  CREATE INDEX IF NOT EXISTS idx_evaluation_scores_trace ON evaluation_scores(trace_id);
`);

function migrateEvaluationScoreColumns(): void {
  const columns = db.prepare(`PRAGMA table_info(evaluation_scores)`).all() as Array<{ name: string }>;
  const existing = new Set(columns.map((c) => c.name));
  const additions: Array<[string, string]> = [
    ["evaluator_type", "TEXT"],
    ["scope", "TEXT"],
    ["version", "TEXT"],
    ["pass_condition", "TEXT"],
    ["metadata_json", "TEXT"],
    ["provider", "TEXT"],
    ["model", "TEXT"],
  ];
  for (const [name, type] of additions) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE evaluation_scores ADD COLUMN ${name} ${type}`);
    }
  }
}

migrateEvaluationScoreColumns();

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

const clearAllSummariesStmt = db.prepare(`DELETE FROM trace_summaries`);

const upsertSummaryStmt = db.prepare(`
  INSERT INTO trace_summaries (trace_id, summary_json, updated_at)
  VALUES (@trace_id, @summary_json, @updated_at)
  ON CONFLICT(trace_id) DO UPDATE SET
    summary_json = excluded.summary_json,
    updated_at = excluded.updated_at
`);

const getSummaryStmt = db.prepare(`
  SELECT * FROM trace_summaries WHERE trace_id = ?
`);

const getSummariesForTracesStmt = db.prepare(`
  SELECT * FROM trace_summaries WHERE trace_id IN (SELECT trace_id FROM events GROUP BY trace_id ORDER BY MAX(timestamp) DESC LIMIT 100)
`);

const deleteEvaluationScoresForTraceStmt = db.prepare(`
  DELETE FROM evaluation_scores WHERE trace_id = ?
`);

const insertEvaluationScoreStmt = db.prepare(`
  INSERT INTO evaluation_scores (
    trace_id, evaluator, name, available, value, passed, explanation, evaluated_at,
    evaluator_type, scope, version, pass_condition, metadata_json, provider, model
  ) VALUES (
    @trace_id, @evaluator, @name, @available, @value, @passed, @explanation, @evaluated_at,
    @evaluator_type, @scope, @version, @pass_condition, @metadata_json, @provider, @model
  )
`);

const getEvaluationScoresForTraceStmt = db.prepare(`
  SELECT * FROM evaluation_scores WHERE trace_id = ? ORDER BY
    CASE name
      WHEN 'task_completion' THEN 1
      WHEN 'tool_efficiency' THEN 2
      WHEN 'loop_detection' THEN 3
      WHEN 'answer_groundedness' THEN 4
      ELSE 99
    END,
    evaluator ASC
`);

const clearAllEvaluationScoresStmt = db.prepare(`DELETE FROM evaluation_scores`);

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

export function upsertTraceSummary(traceId: string, summaryJson: string, updatedAt: number): void {
  upsertSummaryStmt.run({
    trace_id: traceId,
    summary_json: summaryJson,
    updated_at: updatedAt,
  });
}

export function getTraceSummary(traceId: string): TraceSummaryRow | undefined {
  return getSummaryStmt.get(traceId) as TraceSummaryRow | undefined;
}

export function getAllTraceSummaries(): TraceSummaryRow[] {
  return getSummariesForTracesStmt.all() as TraceSummaryRow[];
}

export function upsertEvaluationScores(traceId: string, evaluation: TraceEvaluation): void {
  const transaction = db.transaction(() => {
    deleteEvaluationScoresForTraceStmt.run(traceId);
    for (const score of evaluation.scores) {
      insertEvaluationScoreStmt.run({
        trace_id: traceId,
        evaluator: score.evaluator,
        name: score.name,
        available: score.available ? 1 : 0,
        value: score.available && score.value !== undefined ? score.value : null,
        passed:
          score.available && score.passed !== undefined ? (score.passed ? 1 : 0) : null,
        explanation: score.explanation ?? null,
        evaluated_at: evaluation.evaluated_at,
        evaluator_type: score.evaluator_type ?? null,
        scope: score.scope ?? null,
        version: score.version ?? null,
        pass_condition: score.pass_condition ?? null,
        metadata_json: score.metadata ? JSON.stringify(score.metadata) : null,
        provider: score.provider ?? null,
        model: score.model ?? null,
      });
    }
  });
  transaction();
}

export function getEvaluationScores(traceId: string): TraceEvaluation | null {
  const rows = getEvaluationScoresForTraceStmt.all(traceId) as EvaluationScoreRow[];
  if (rows.length === 0) return null;

  const scores = rows.map((row) => {
    let metadata: Record<string, unknown> | undefined;
    if (row.metadata_json) {
      try {
        metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
      } catch {
        metadata = undefined;
      }
    }

    return {
      evaluator: row.evaluator,
      name: row.name,
      available: Boolean(row.available),
      value: row.value ?? undefined,
      passed: row.passed === null ? undefined : Boolean(row.passed),
      explanation: row.explanation ?? undefined,
      evaluator_type: row.evaluator_type as "deterministic" | "llm" | undefined,
      scope: row.scope ?? undefined,
      version: row.version ?? undefined,
      pass_condition: row.pass_condition ?? undefined,
      metadata,
      provider: row.provider ?? undefined,
      model: row.model ?? undefined,
    };
  });

  return {
    trace_id: traceId,
    scores,
    overall_score: computeOverallScore(scores),
    passed: computeOverallPassed(scores),
    evaluated_at: rows[0]?.evaluated_at ?? 0,
    aggregation_method: "mean of available evaluator scores",
    evaluators_available: scores.filter((s) => s.available && typeof s.value === "number").length,
    evaluators_passed: scores.filter((s) => s.available && s.passed === true).length,
  };
}

export function clearDatabase(): void {
  const transaction = db.transaction(() => {
    clearAllEventsStmt.run();
    clearAllRcaStmt.run();
    clearAllCommandsStmt.run();
    clearAllSummariesStmt.run();
    clearAllEvaluationScoresStmt.run();
  });
  transaction();
}

export function closeDb(): void {
  db.close();
}

export { dbPath };
