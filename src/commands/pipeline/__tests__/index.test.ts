import { describe, expect, test } from "vitest";
import * as pipelineModule from "../index";

const call = pipelineModule.call;

describe("pipeline", () => {
  test("returns help for empty args", async () => {
    const result = await call("");
    expect(result.type).toBe("text");
    expect(result.value).toContain("Pipeline");
    expect(result.value).toContain("--sort");
  });

  test("returns help for --help", async () => {
    const result = await call("--help");
    expect(result.type).toBe("text");
    expect(result.value).toContain("--where");
    expect(result.value).toContain("--map");
    expect(result.value).toContain("--dedupe");
  });

  test("sorts data by field ascending", async () => {
    const result = await call("--sort age --json");
    const data = JSON.parse(result.value);
    expect(data.total).toBe(10);
    expect(data.data[0].name).toBe("Bob");
    expect(data.data[0].age).toBe(25);
  });

  test("sorts data by field descending with - prefix", async () => {
    const result = await call("--sort -age --json");
    const data = JSON.parse(result.value);
    expect(data.data[0].name).toBe("Jack");
    expect(data.data[0].age).toBe(45);
  });

  test("filters data with --where", async () => {
    const result = await call("--where 'age > 30' --json");
    const data = JSON.parse(result.value);
    expect(data.total).toBeGreaterThan(0);
    for (const row of data.data) {
      expect(row.age).toBeGreaterThan(30);
    }
  });

  test("filters with department", async () => {
    const result = await call("--where 'department == Engineering' --json");
    const data = JSON.parse(result.value);
    expect(data.total).toBe(4);
    for (const row of data.data) {
      expect(row.department).toBe("Engineering");
    }
  });

  test("maps fields with --map", async () => {
    const result = await call("--map 'label:$name' --json");
    const data = JSON.parse(result.value);
    expect(data.total).toBe(10);
    expect(data.data[0]).toHaveProperty('label');
    expect(data.data[0]).toHaveProperty('name');
    expect(data.data[0]).toHaveProperty('age');
  });

  test("dedupes by field", async () => {
    const result = await call("--dedupe department --json");
    const data = JSON.parse(result.value);
    const depts = data.data.map((r: any) => r.department);
    expect(new Set(depts).size).toBe(depts.length);
  });

  test("limits output", async () => {
    const result = await call("--limit 3 --json");
    const data = JSON.parse(result.value);
    expect(data.total).toBe(3);
  });

  test("chains sort + where + limit", async () => {
    const result = await call("--where 'age > 25' --sort -salary --limit 2 --json");
    const data = JSON.parse(result.value);
    expect(data.total).toBeLessThanOrEqual(2);
    if (data.total >= 2) {
      expect(data.data[0].salary).toBeGreaterThanOrEqual(data.data[1].salary);
    }
  });

  test("--count returns only count", async () => {
    const result = await call("--where 'age > 30' --count");
    expect(result.type).toBe("text");
    expect(result.value).toContain("Total:");
  });

  test("non-json output is markdown table", async () => {
    const result = await call("--limit 2");
    expect(result.type).toBe("text");
    expect(result.value).toContain("|");
    expect(result.value).toContain("---");
  });
});
