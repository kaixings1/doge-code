import { describe, expect, test } from "vitest";
import * as seoAuditModule from "../index";

const seoCall = seoAuditModule.call

import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { tmpdir } from "os"

function tempFile(name: string, content: string): string {
  const dir = join(tmpdir(), "seo-audit-" + Date.now())
  mkdirSync(dir, { recursive: true })
  const full = join(dir, name)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
  return full
}

describe("seo-audit", () => {
  test("returns help for empty args", async () => {
    const result = await seoCall("")
    expect(result.type).toBe("text")
    expect(result.value).toContain("SEO")
  })

  test("returns help for --help", async () => {
    const result = await seoCall("--help")
    expect(result.type).toBe("text")
    expect(result.value).toContain("min-length")
  })

  test("detects missing title", async () => {
    const file = tempFile("test.md", "---\ndescription: test desc\n---\n\nHello world content here enough words to pass")
    const result = await seoCall(`--json ${file}`)
    const data = JSON.parse(result.value)
    expect(data.issues.some((i: any) => i.rule === "missing-title")).toBe(true)
  })

  test("detects missing description", async () => {
    const file = tempFile("test2.md", "---\ntitle: This is a sufficiently long title for testing purposes here\n---\n\nHello world content here enough words to pass")
    const result = await seoCall(`--json ${file}`)
    const data = JSON.parse(result.value)
    expect(data.issues.some((i: any) => i.rule === "missing-desc")).toBe(true)
  })

  test("detects thin content", async () => {
    const file = tempFile("test3.md", "---\ntitle: This is a sufficiently long title for testing purposes here\ndescription: This is a sufficiently long description for testing SEO purposes here\n---\n\nshort")
    const result = await seoCall(`--json ${file}`)
    const data = JSON.parse(result.value)
    expect(data.issues.some((i: any) => i.rule === "thin-content")).toBe(true)
  })

  test("passes clean file", async () => {
    // description must be 120-160 chars, title 30-70 chars
    const desc = "SEO optimized page description with primary keywords for search engine ranking and visibility improvement across all devices and platforms"
    const body = Array(40).fill("This is a sentence with enough words to make the document substantial and pass SEO requirements well enough for testing.").join(" ")
    const content = `---
title: SEO Optimized Page Title for Testing Purposes Here and Now
description: ${desc}
---

# Introduction

${body}
`
    const file = tempFile("clean.md", content)
    const result = await seoCall(`--json ${file}`)
    const data = JSON.parse(result.value)
    expect(data.issues.length).toBe(0)
  })

  test("outputs non-json format by default", async () => {
    const file = tempFile("test4.md", "---\ntitle: Short\ndescription: Short\n---\n\nshort")
    const result = await seoCall(file)
    expect(result.type).toBe("text")
    expect(result.value).toContain("SEO 审计")
  })

  test("detects missing H1", async () => {
    const content = `---
title: This is a sufficiently long title for testing purposes here
description: This is a sufficiently long description for testing purposes here
---

Some paragraph without heading
`
    const file = tempFile("no-h1.md", content)
    const result = await seoCall(`--json ${file}`)
    const data = JSON.parse(result.value)
    expect(data.issues.some((i: any) => i.rule === "missing-h1")).toBe(true)
  })

  test("detects title length issue", async () => {
    const file = tempFile("short-title.md", "---\ntitle: Short\ndescription: This is a sufficiently long description for testing SEO purposes here\n---\n\nHello world content here enough words to pass")
    const result = await seoCall(`--json ${file}`)
    const data = JSON.parse(result.value)
    expect(data.issues.some((i: any) => i.rule === "title-length")).toBe(true)
  })
})
