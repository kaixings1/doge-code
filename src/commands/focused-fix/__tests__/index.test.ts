import { describe, expect, test } from "vitest";
import * as focusedFixModule from "../index";

const ffCall = focusedFixModule.call

import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { tmpdir } from "os"

function tempDir(name: string, files: Record<string, string>): string {
  const dir = join(tmpdir(), "focused-fix-" + Date.now())
  mkdirSync(dir, { recursive: true })
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return dir
}

describe("focused-fix", () => {
  test("returns help for empty args", async () => {
    const result = await ffCall("")
    expect(result.type).toBe("text")
    expect(result.value).toContain("Focused Fix")
  })

  test("returns help for --help", async () => {
    const result = await ffCall("--help")
    expect(result.type).toBe("text")
    expect(result.value).toContain("SCOPE")
  })

  test("runs full pipeline on valid target", async () => {
    const dir = tempDir("mod", {
      "index.ts": "export const foo = 1\nexport function bar() { return foo }\n",
      "utils.ts": "export function helper() { return 42 }\n",
    })
    const result = await ffCall(`--json ${dir}`)
    const data = JSON.parse(result.value)
    expect(data.target).toBe(dir)
    expect(data.phases.length).toBe(5)
    expect(data.phases[0].phase).toBe(1)
    expect(data.phases[0].name).toBe("SCOPE")
    expect(data.phases[1].phase).toBe(2)
    expect(data.phases[1].name).toBe("TRACE")
    expect(data.phases[2].phase).toBe(3)
    expect(data.phases[2].name).toBe("DIAGNOSE")
    expect(data.phases[3].phase).toBe(4)
    expect(data.phases[3].name).toBe("FIX")
    expect(data.phases[4].phase).toBe(5)
    expect(data.phases[4].name).toBe("VERIFY")
    expect(data.verdict).toBeDefined()
  })

  test("detects missing test files", async () => {
    const dir = tempDir("notest", {
      "index.ts": "export const x = 1\n",
    })
    const result = await ffCall(`--json ${dir}`)
    const data = JSON.parse(result.value)
    const diag = data.phases.find((p: any) => p.phase === 3)
    expect(diag.findings.some((f: string) => f.includes("测试文件"))).toBe(true)
  })

  test("dry-run mode", async () => {
    const dir = tempDir("dry", {
      "index.ts": "export const x = 1\n",
    })
    const result = await ffCall(`--dry-run --json ${dir}`)
    const data = JSON.parse(result.value)
    const fix = data.phases.find((p: any) => p.phase === 4)
    expect(fix.status).toBe("warn")
    expect(fix.findings.some((f: string) => f.includes("dry-run"))).toBe(true)
  })

  test("single phase execution", async () => {
    const dir = tempDir("single", {
      "index.ts": "export const x = 1\n",
    })
    const result = await ffCall(`--phase 3 --json ${dir}`)
    const data = JSON.parse(result.value)
    expect(data.phases.length).toBe(1)
    expect(data.phases[0].phase).toBe(3)
    expect(data.phases[0].name).toBe("DIAGNOSE")
  })

  test("handles non-existent path", async () => {
    const result = await ffCall("--json /nonexistent/path/12345")
    const data = JSON.parse(result.value)
    expect(data.verdict).toBe("FAIL")
    expect(data.phases.some((p: any) => p.status === "fail")).toBe(true)
  })

  test("non-json output format", async () => {
    const dir = tempDir("fmt", {
      "index.ts": "export const x = 1\n",
    })
    const result = await ffCall(dir)
    expect(result.type).toBe("text")
    expect(result.value).toContain("Focused Fix Report")
    expect(result.value).toContain("Phase 1")
  })
})
