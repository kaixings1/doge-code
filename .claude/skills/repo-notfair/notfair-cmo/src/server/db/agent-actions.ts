import { randomUUID } from "node:crypto";
import { getDb } from "./db";

export type AgentAction = {
  id: string;
  project_slug: string;
  agent_id: string;
  task_id: string | null;
  action_type: string;
  summary: string;
  reasoning: string | null;
  payload_json: string | null;
  occurred_at: string;
};

export type LogActionInput = {
  project_slug: string;
  agent_id: string;
  action_type: string;
  summary: string;
  reasoning?: string | null;
  task_id?: string | null;
  payload?: unknown;
};

export function logAgentAction(input: LogActionInput): AgentAction {
  const db = getDb();
  const action: AgentAction = {
    id: randomUUID(),
    project_slug: input.project_slug,
    agent_id: input.agent_id,
    task_id: input.task_id ?? null,
    action_type: input.action_type,
    summary: input.summary,
    reasoning: input.reasoning ?? null,
    payload_json: input.payload === undefined ? null : JSON.stringify(input.payload),
    occurred_at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO agent_actions (id, project_slug, agent_id, task_id, action_type, summary, reasoning, payload_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    action.id,
    action.project_slug,
    action.agent_id,
    action.task_id,
    action.action_type,
    action.summary,
    action.reasoning,
    action.payload_json,
    action.occurred_at,
  );
  return action;
}

export function listAgentActions(project_slug: string, limit = 50): AgentAction[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM agent_actions WHERE project_slug = ? ORDER BY occurred_at DESC LIMIT ?")
    .all(project_slug, limit) as AgentAction[];
}
