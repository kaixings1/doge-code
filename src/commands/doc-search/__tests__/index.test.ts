import { describe, expect, test } from "vitest";
import * as docSearchModule from "../index";

const call = docSearchModule.call;

describe("doc-search", () => {
  test("returns help for empty args", async () => {
    const result = await call("");
    expect(result.type).toBe("text");
    expect(result.value).toContain("Doc Search");
    expect(result.value).toContain("--tech");
    expect(result.value).toContain("--api");
    expect(result.value).toContain("--similar");
  })

  test("returns help for --help", async () => {
    const result = await call("--help")
    expect(result.type).toBe("text")
    expect(result.value).toContain("用法")
    expect(result.value).toContain("--json")
  })

  test("searches technologies by name with --tech", async () => {
    const result = await call("--tech SwiftUI")
    expect(result.type).toBe("text")
    expect(result.value).toContain("SwiftUI")
    expect(result.value).toContain("User Interfaces")
    expect(result.value).toContain("iOS 13+")
  })

  test("searches APIs by name with --api", async () => {
    const result = await call("--api View")
    expect(result.type).toBe("text")
    expect(result.value).toContain("View")
    expect(result.value).toContain("SwiftUI")
    expect(result.value).toContain("protocol")
  })

  test("searches by framework name with --api", async () => {
    const result = await call("--api Foundation")
    expect(result.type).toBe("text")
    expect(result.value).toContain("URLSession")
  })

  test("finds similar APIs with --similar", async () => {
    const result = await call("--similar URLSession")
    expect(result.type).toBe("text")
    expect(result.value).toContain("Similar APIs to URLSession")
    expect(result.value).toContain("URLSessionConfiguration")
    expect(result.value).toContain("Similarity:")
  })

  test("returns not found for unknown --similar", async () => {
    const result = await call("--similar NonExistentAPI")
    expect(result.type).toBe("text")
    expect(result.value).toContain("No similar APIs found")
  })

  test("returns not found for unknown --tech", async () => {
    const result = await call("--tech NonExistentTech")
    expect(result.type).toBe("text")
    expect(result.value).toContain("No technologies found")
    expect(result.value).toContain("Available technologies")
  })

  test("returns JSON output for --tech", async () => {
    const result = await call("--json --tech SwiftUI")
    expect(result.type).toBe("text")
    const data = JSON.parse(result.value)
    expect(data.query).toBe("SwiftUI")
    expect(data.total).toBeGreaterThan(0)
    expect(data.technologies[0].name).toBe("SwiftUI")
    expect(data.technologies[0].platforms).toContain("iOS 13+")
  })

  test("returns JSON output for --api", async () => {
    const result = await call("--json --api URLSession")
    expect(result.type).toBe("text")
    const data = JSON.parse(result.value)
    expect(data.query).toBe("URLSession")
    expect(data.total).toBeGreaterThan(0)
    expect(data.apis[0].name).toBe("URLSession")
    expect(data.apis[0].kind).toBe("class")
  })

  test("returns JSON output for --similar", async () => {
    const result = await call("--json --similar URLSession")
    expect(result.type).toBe("text")
    const data = JSON.parse(result.value)
    expect(data.query).toBe("URLSession")
    expect(data.total).toBeGreaterThan(0)
    expect(data.apis[0].similarity).toBeGreaterThanOrEqual(1)
    expect(data.apis[0].similarity).toBeLessThanOrEqual(10)
  })

  test("general search matches both technologies and APIs", async () => {
    const result = await call("SwiftUI")
    expect(result.type).toBe("text")
    expect(result.value).toContain("Technologies")
    expect(result.value).toContain("APIs")
  })

  test("general search returns not found for unknown query", async () => {
    const result = await call("--json NonExistentQuery12345")
    expect(result.type).toBe("text")
    const data = JSON.parse(result.value)
    expect(data.error).toBe("No results found")
    expect(data.suggestion).toBeDefined()
  })

  test("returns not found for unknown --api", async () => {
    const result = await call("--api NonExistentAPI")
    expect(result.type).toBe("text")
    expect(result.value).toContain("No APIs found")
  })

  test("non-JSON output includes markdown links", async () => {
    const result = await call("--tech Foundation")
    expect(result.type).toBe("text")
    expect(result.value).toContain("[")
    expect(result.value).toContain("](")
    expect(result.value).toContain("developer.apple.com")
  })
})
