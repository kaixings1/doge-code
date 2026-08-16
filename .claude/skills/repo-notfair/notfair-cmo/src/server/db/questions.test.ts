import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIGRATIONS } from "./migrations";

let testDb: Database.Database;

vi.mock("./db", () => ({
  getDb: () => testDb,
  getDbPath: () => ":memory:",
}));

import {
  answerQuestion,
  cancelQuestion,
  createQuestion,
  getQuestion,
  listOpenQuestionsForProject,
  listOpenQuestionsForTask,
  listQuestionsForTask,
  parseQuestionOptions,
} from "./questions";

function applyMigrations(db: Database.Database): void {
  for (const m of MIGRATIONS) db.exec(m.sql);
}

function createDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  return db;
}

function seedProject(slug = "acme"): void {
  testDb
    .prepare(
      "INSERT INTO projects (id, slug, display_name, created_at) VALUES (?, ?, ?, ?)",
    )
    .run("p-" + slug, slug, slug, "2026-01-01T00:00:00.000Z");
}

function seedTask(id = "t-1", project_slug = "acme"): string {
  testDb
    .prepare(
      `INSERT INTO tasks
         (id, project_slug, agent_id, brief, status, created_at, updated_at, display_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      project_slug,
      `${project_slug}-cmo`,
      "do the thing",
      "working",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      // display_id is globally unique — derive from the task id so multiple
      // seedTask() calls in one test don't collide.
      `${project_slug}-${id}`,
    );
  return id;
}

beforeEach(() => {
  testDb = createDb();
});

afterEach(() => {
  testDb.close();
});

describe("createQuestion", () => {
  it("persists a pending question with options serialized as JSON", () => {
    seedProject();
    const taskId = seedTask();
    const q = createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo",
      task_id: taskId,
      prompt: "Which channel should we test first?",
      options: ["Google Ads", "Meta", "TikTok"],
    });
    expect(q.id).toMatch(/[0-9a-f-]{36}/);
    expect(q.status).toBe("pending");
    expect(q.resolved_at).toBeNull();
    expect(q.answer_option_index).toBeNull();
    expect(q.answer_text).toBeNull();
    expect(parseQuestionOptions(q)).toEqual(["Google Ads", "Meta", "TikTok"]);
  });

  it("stores an empty options array when none are supplied", () => {
    seedProject();
    const q = createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo",
      prompt: "Free text only",
      options: [],
    });
    expect(parseQuestionOptions(q)).toEqual([]);
  });
});

describe("listOpenQuestionsForTask / listOpenQuestionsForProject", () => {
  it("filters by status=pending and the right scope", () => {
    seedProject();
    const taskA = seedTask("t-a");
    const taskB = seedTask("t-b");
    const open = createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo",
      task_id: taskA,
      prompt: "Open on A",
      options: [],
    });
    const other = createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo",
      task_id: taskB,
      prompt: "Open on B",
      options: [],
    });
    const cancelled = createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo",
      task_id: taskA,
      prompt: "Will be cancelled",
      options: [],
    });
    cancelQuestion(cancelled.id);

    const openOnA = listOpenQuestionsForTask(taskA);
    expect(openOnA.map((q) => q.id)).toEqual([open.id]);

    const allProject = listOpenQuestionsForProject("acme");
    expect(allProject.map((q) => q.id).sort()).toEqual(
      [open.id, other.id].sort(),
    );
  });
});

describe("listQuestionsForTask", () => {
  it("returns every question on the task regardless of status, newest first", () => {
    seedProject();
    const taskId = seedTask();
    const first = createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo",
      task_id: taskId,
      prompt: "First",
      options: [],
    });
    const second = createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo",
      task_id: taskId,
      prompt: "Second",
      options: [],
    });
    cancelQuestion(first.id);

    const rows = listQuestionsForTask(taskId);
    expect(rows.map((q) => q.id)).toEqual([second.id, first.id]);
  });
});

describe("answerQuestion", () => {
  it("marks the row answered with option_index and text, sets resolved_at", () => {
    seedProject();
    const taskId = seedTask();
    const q = createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo",
      task_id: taskId,
      prompt: "Pick one",
      options: ["A", "B"],
    });
    const after = answerQuestion({
      id: q.id,
      answer_option_index: 1,
      answer_text: "B with caveats",
    });
    expect(after).not.toBeNull();
    expect(after?.status).toBe("answered");
    expect(after?.answer_option_index).toBe(1);
    expect(after?.answer_text).toBe("B with caveats");
    expect(after?.resolved_by_kind).toBe("user");
    expect(after?.resolved_at).toBeTruthy();
  });

  it("is a no-op when the row is already terminal (returns null)", () => {
    seedProject();
    const q = createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo",
      prompt: "Already cancelled",
      options: [],
    });
    cancelQuestion(q.id);
    const result = answerQuestion({
      id: q.id,
      answer_option_index: null,
      answer_text: "too late",
    });
    expect(result).toBeNull();
    const fresh = getQuestion(q.id);
    expect(fresh?.status).toBe("cancelled");
  });
});

describe("cancelQuestion", () => {
  it("marks pending → cancelled and is idempotent (second call returns null)", () => {
    seedProject();
    const q = createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo",
      prompt: "Cancel me",
      options: [],
    });
    const first = cancelQuestion(q.id);
    expect(first?.status).toBe("cancelled");
    const again = cancelQuestion(q.id);
    expect(again).toBeNull();
  });
});

describe("parseQuestionOptions", () => {
  it("returns [] for malformed JSON or non-string entries", () => {
    seedProject();
    const q = createQuestion({
      project_slug: "acme",
      agent_id: "acme-cmo",
      prompt: "fine",
      options: ["x"],
    });
    expect(parseQuestionOptions(q)).toEqual(["x"]);
    expect(parseQuestionOptions({ ...q, options_json: "not json" })).toEqual([]);
    expect(parseQuestionOptions({ ...q, options_json: "[1, 2]" })).toEqual([]);
  });
});
