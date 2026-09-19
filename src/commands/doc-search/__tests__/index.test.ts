import { describe, expect, test } from "vitest";
import * as docSearchModule from "../index";
import { expectText } from "../../../__tests__/utils/commandResult.js";

const call = docSearchModule.call;

/** 调用命令并断言返回 text 结果，返回其 value */
async function callText(args: string): Promise<string> {
  return expectText(await call(args));
}

describe("doc-search", () => {
  test("returns help for empty args", async () => {
    const value = await callText("");
    expect(value).toContain("Doc Search");
    expect(value).toContain("--tech");
    expect(value).toContain("--api");
    expect(value).toContain("--similar");
  })

  test("returns help for --help", async () => {
    const value = await callText("--help")
    expect(value).toContain("用法")
    expect(value).toContain("--json")
  })

  test("searches technologies by name with --tech", async () => {
    const value = await callText("--tech SwiftUI")
    expect(value).toContain("SwiftUI")
    expect(value).toContain("User Interfaces")
    expect(value).toContain("iOS 13+")
  })

  test("searches APIs by name with --api", async () => {
    const value = await callText("--api View")
    expect(value).toContain("View")
    expect(value).toContain("SwiftUI")
    expect(value).toContain("protocol")
  })

  test("searches by framework name with --api", async () => {
    const value = await callText("--api Foundation")
    expect(value).toContain("URLSession")
  })

  test("finds similar APIs with --similar", async () => {
    const value = await callText("--similar URLSession")
    expect(value).toContain("Similar APIs to URLSession")
    expect(value).toContain("URLSessionConfiguration")
    expect(value).toContain("Similarity:")
  })

  test("returns not found for unknown --similar", async () => {
    const value = await callText("--similar NonExistentAPI")
    expect(value).toContain("No similar APIs found")
  })

  test("returns not found for unknown --tech", async () => {
    const value = await callText("--tech NonExistentTech")
    expect(value).toContain("No technologies found")
    expect(value).toContain("Available technologies")
  })

  test("returns JSON output for --tech", async () => {
    const value = await callText("--json --tech SwiftUI")
    const data = JSON.parse(value)
    expect(data.query).toBe("SwiftUI")
    expect(data.total).toBeGreaterThan(0)
    expect(data.technologies[0].name).toBe("SwiftUI")
    expect(data.technologies[0].platforms).toContain("iOS 13+")
  })

  test("returns JSON output for --api", async () => {
    const value = await callText("--json --api URLSession")
    const data = JSON.parse(value)
    expect(data.query).toBe("URLSession")
    expect(data.total).toBeGreaterThan(0)
    expect(data.apis[0].name).toBe("URLSession")
    expect(data.apis[0].kind).toBe("class")
  })

  test("returns JSON output for --similar", async () => {
    const value = await callText("--json --similar URLSession")
    const data = JSON.parse(value)
    expect(data.query).toBe("URLSession")
    expect(data.total).toBeGreaterThan(0)
    expect(data.apis[0].similarity).toBeGreaterThanOrEqual(1)
    expect(data.apis[0].similarity).toBeLessThanOrEqual(10)
  })

  test("general search matches both technologies and APIs", async () => {
    const value = await callText("SwiftUI")
    expect(value).toContain("Technologies")
    expect(value).toContain("APIs")
  })

  test("general search returns not found for unknown query", async () => {
    const value = await callText("--json NonExistentQuery12345")
    const data = JSON.parse(value)
    expect(data.error).toBe("No results found")
    expect(data.suggestion).toBeDefined()
  })

  test("returns not found for unknown --api", async () => {
    const value = await callText("--api NonExistentAPI")
    expect(value).toContain("No APIs found")
  })

  test("non-JSON output includes markdown links", async () => {
    const value = await callText("--tech Foundation")
    expect(value).toContain("[")
    expect(value).toContain("](")
    expect(value).toContain("developer.apple.com")
  })
})
