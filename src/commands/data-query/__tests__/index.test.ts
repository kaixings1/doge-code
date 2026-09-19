import { describe, expect, test } from "vitest";
import * as dataQueryModule from "../index";
import { expectText } from "../../../__tests__/utils/commandResult.js";

const call = dataQueryModule.call;

describe("data-query", () => {
  test("returns help for empty args", async () => {
    const result = await call("");
    expect(expectText(result)).toContain("Data Query");
    expect(expectText(result)).toContain("--filter");
  });

  test("returns help for --help", async () => {
    const result = await call("--help");
    expect(expectText(result)).toContain("--select");
    expect(expectText(result)).toContain("--format");
  });

  test("filters by department", async () => {
    const result = await call("--filter 'department == Engineering' --json");
    const data = JSON.parse(expectText(result));
    expect(data.total).toBeGreaterThan(0);
    for (const row of data.data) {
      expect(row.department).toBe("Engineering");
    }
  });

  test("filters by numeric comparison", async () => {
    const result = await call("--filter 'salary > 20000' --json");
    const data = JSON.parse(expectText(result));
    expect(data.total).toBeGreaterThan(0);
    for (const row of data.data) {
      expect(row.salary).toBeGreaterThan(20000);
    }
  });

  test("selects specific fields", async () => {
    const result = await call("--select name,age --json");
    const data = JSON.parse(expectText(result));
    expect(data.total).toBe(10);
    for (const row of data.data) {
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('age');
      expect(row).not.toHaveProperty('salary');
    }
  });

  test("limits output", async () => {
    const result = await call("--limit 3 --json");
    const data = JSON.parse(expectText(result));
    expect(data.total).toBe(3);
  });

  test("--count returns only count", async () => {
    const result = await call("--filter 'age > 30' --count");
    const data = JSON.parse(expectText(result));
    expect(data).toHaveProperty('total');
  });

  test("--format raw outputs JSON per line", async () => {
    const result = await call("--limit 2 --format raw");
    const lines = expectText(result).split('\n').filter(l => l.trim());
    expect(lines.length).toBe(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  test("non-json default is table format", async () => {
    const result = await call("--limit 2");
    expect(expectText(result)).toContain("|");
    expect(expectText(result)).toContain("---");
  });

  test("chains filter + select + limit", async () => {
    const result = await call("--filter 'department == Engineering' --select name,salary --limit 2 --json");
    const data = JSON.parse(expectText(result));
    expect(data.total).toBeLessThanOrEqual(2);
    for (const row of data.data) {
      expect(row.department).toBeUndefined();
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('salary');
    }
  });

  test("returns all records when no filter", async () => {
    const result = await call("--json");
    const data = JSON.parse(expectText(result));
    expect(data.total).toBe(10);
  });
});
