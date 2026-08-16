import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { CostEvent, CostEventSource } from "@/types";

export type RecordCostInput = {
  project_slug: string;
  agent_id?: string | null;
  source: CostEventSource;
  amount_usd: number;
  ref?: string | null;
  occurred_at?: string;
};

export function recordCost(input: RecordCostInput): CostEvent {
  const db = getDb();
  const event: CostEvent = {
    id: randomUUID(),
    project_slug: input.project_slug,
    agent_id: input.agent_id ?? null,
    source: input.source,
    amount_usd: input.amount_usd,
    ref: input.ref ?? null,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO cost_events (id, project_slug, agent_id, source, amount_usd, ref, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    event.id,
    event.project_slug,
    event.agent_id,
    event.source,
    event.amount_usd,
    event.ref,
    event.occurred_at,
  );
  return event;
}

export type CostSummary = {
  total_usd: number;
  by_source: Record<CostEventSource, number>;
};

const ZERO_BY_SOURCE: Record<CostEventSource, number> = {
  llm: 0,
  google_ads: 0,
  gsc: 0,
  other: 0,
};

export function costToday(project_slug: string): CostSummary {
  const db = getDb();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since = startOfDay.toISOString();
  const rows = db
    .prepare(
      "SELECT source, COALESCE(SUM(amount_usd), 0) AS total FROM cost_events WHERE project_slug = ? AND occurred_at >= ? GROUP BY source",
    )
    .all(project_slug, since) as { source: CostEventSource; total: number }[];

  const by_source = { ...ZERO_BY_SOURCE };
  let total_usd = 0;
  for (const row of rows) {
    by_source[row.source] = row.total;
    total_usd += row.total;
  }
  return { total_usd, by_source };
}
