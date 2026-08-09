/**
 * engine/testDrivenFix/fixLoop.ts — 测试驱动修复闭环主循环
 *
 * 吸收自 Agentless (SWE-bench 定位→修复流水线)：
 *
 *   ┌─────────┐    ┌───────────┐    ┌──────────┐    ┌────────┐
 *   │ 测试失败 │ → │ 文件级定位 │ → │ 位置定位  │ → │ 修复    │
 *   └─────────┘    └───────────┘    └──────────┘    └────────┘
 *      ↑                                                ↓
 *      └──────── 回归验证（lint/test） ← 补丁应用 ←──────┘
 *
 * 与 doge-code 现有 autoFixLoop（处理 lint/编译错误）互补：
 * autoFixLoop 在编辑后自动 lint→test→fix；
 * 本循环从测试失败出发，先定位再修复，形成完整闭环。
 */

import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { resolve } from 'path'
import type {
  FixLoopResult,
  PatchResult,
  RepoStructure,
  TestFailure,
} from './types.js'
import {
  buildRepoStructure,
  transferLocsToIntervals,
  readProjectFiles,
  isTestFile,
  getFileLineCount,
} from './repoStructure.js'
import { readFileSync as readLocalFile } from 'fs'
import { parseEditCommands, applyPatch } from './patchParser.js'
import {
  buildFileLocalizePrompt,
  buildCodeLocalizePrompt,
  buildRepairPrompt,
  buildProblemFromTestFailure,
} from './localize.js'

// ============================================================================
// 配置
// ============================================================================

export interface FixLoopConfig {
  /** 项目根目录（默认 process.cwd()） */
  projectRoot?: string
  /** 最大迭代轮数（默认 3） */
  maxIterations?: number
  /** 定位时最大展示文件数 */
  maxFiles?: number
  /** 上下文窗口行数（默认 10） */
  contextWindow?: number
  /** 是否启用测试验证（默认 true） */
  verifyWithTest?: boolean
  /** 测试命令模板（默认自动检测） */
  testCommand?: string
  /** lint 命令模板（可选） */
  lintCommand?: string
  /** 排除目录 */
  excludeDirs?: string[]
}

// ============================================================================
// 测试框架检测与运行
// ============================================================================

const TEST_COMMANDS: Array<{ detect: () => boolean; cmd: string }> = [
  { detect: () => exists('vitest.config.ts') || exists('vitest.config.js'), cmd: 'npx vitest run 2>&1' },
  { detect: () => exists('jest.config.ts') || exists('jest.config.js'), cmd: 'npx jest --runInBand 2>&1' },
  { detect: () => exists('.mocharc.js') || exists('.mocharc.json'), cmd: 'npx mocha 2>&1' },
  { detect: () => exists('pyproject.toml') || exists('requirements.txt'), cmd: 'python -m pytest 2>&1' },
  { detect: () => exists('go.mod'), cmd: 'go test ./... 2>&1' },
  { detect: () => exists('Cargo.toml'), cmd: 'cargo test 2>&1' },
]

function exists(path: string): boolean {
  try {
    return readLocalFile(path, 'utf-8').length >= 0
  } catch {
    return false
  }
}

/** 检测测试框架并返回命令 */
export function detectTestCommand(projectRoot = process.cwd()): string {
  for (const t of TEST_COMMANDS) {
    if (t.detect()) return t.cmd
  }
  // 兜底：package.json 中查找 test 脚本
  try {
    const pkg = JSON.parse(readLocalFile(`${projectRoot}/package.json`, 'utf-8'))
    if (pkg.scripts?.test) return `npm test 2>&1`
  } catch { /* ignore */ }
  return ''
}

/** 运行测试命令，返回输出（无论成败） */
export function runTestCommand(command: string, projectRoot: string): string {
  try {
    return execSync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return (err.stdout || err.stderr || err.message || String(e)).toString()
  }
}

/** 运行 lint 命令 */
export function runLintCommand(command: string, projectRoot: string): string {
  try {
    return execSync(command, {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return (err.stdout || err.stderr || err.message || String(e)).toString()
  }
}

// ============================================================================
// 测试失败解析
// ============================================================================

/**
 * 解析测试输出，提取失败信息。
 * 支持 vitest/jest/mocha/pytest/go 常见输出格式。
 */
export function parseTestFailures(testOutput: string): TestFailure[] {
  const failures: TestFailure[] = []
  const lines = testOutput.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // vitest/jest: FAIL path/file.test.ts > suite > case
    let m = line.match(/^(?:FAIL|✕|✗)\s+(.+?\.(?:test|spec)\.[a-z]+)(?:\s*>|\s+)/i)
    if (m) {
      const file = m[1]
      // 收集后续错误行
      let msg = ''
      let j = i + 1
      while (j < lines.length && j < i + 10) {
        if (/^FAIL|^PASS|^Tests\s|^Test Files/.test(lines[j])) break
        if (lines[j].trim()) msg += lines[j].trim() + '\n'
        j++
      }
      failures.push({
        file: file.split('/').pop(),
        rawOutput: msg.trim(),
        message: msg.trim().split('\n')[0] ?? '',
      })
      continue
    }

    // 简单格式: 1) test name (file)
    m = line.match(/^\s*(\d+)\)\s+(.+?)\s*\((.+?\.(?:test|spec)\.[a-z]+)\)/)
    if (m) {
      const file = m[3]
      const testName = m[2]
      let msg = ''
      let j = i + 1
      while (j < lines.length && j < i + 10) {
        if (/^\s*\d+\)/.test(lines[j])) break
        if (lines[j].trim()) msg += lines[j].trim() + '\n'
        j++
      }
      failures.push({
        file: file.split('/').pop(),
        testName,
        rawOutput: msg.trim(),
        message: msg.trim().split('\n')[0] ?? '',
      })
    }

    // pytest: FAILED path/file.py::test_name - AssertionError: ...
    m = line.match(/FAILED\s+(.+?\.py)::(\w+)\s+-\s+(.+)/)
    if (m) {
      failures.push({
        file: m[1].split('/').pop(),
        testName: m[2],
        message: m[3],
        rawOutput: m[3],
      })
    }

    // go: --- FAIL: TestName (file)
    m = line.match(/---\s+FAIL:\s+(Test\w+)\s+\((\d+\.\d+s)\)/)
    if (m) {
      failures.push({ testName: m[1], rawOutput: line, message: line })
    }
  }

  return failures
}

/** 判断测试输出是否全部通过 */
export function isTestPassing(testOutput: string): boolean {
  // 明确失败标记
  if (/FAILED|Tests:\s*\d+\s+failed|\d+ failing|---\s+FAIL:/.test(testOutput)) {
    return false
  }
  // 通过标记
  if (/Tests:\s*\d+\s+passed|\d+ passed|ok\s+.*(?:test|PASS)/i.test(testOutput)) {
    return true
  }
  // 无法判断时视为失败（保守）
  return false
}

// ============================================================================
// 主循环
// ============================================================================

/**
 * 测试驱动修复闭环。
 *
 * @param problem 问题描述（issue 文本）或测试失败输出
 * @param config  配置
 * @returns 修复循环结果
 */
export async function runFixLoop(
  problem: string,
  config: FixLoopConfig = {},
): Promise<FixLoopResult> {
  const projectRoot = config.projectRoot ?? process.cwd()
  const maxIterations = config.maxIterations ?? 3
  const maxFiles = config.maxFiles ?? 200
  const contextWindow = config.contextWindow ?? 10
  const verifyWithTest = config.verifyWithTest ?? true
  const testCommand = config.testCommand ?? detectTestCommand(projectRoot)
  const lintCommand = config.lintCommand

  const result: FixLoopResult = {
    success: false,
    stages: [],
    patches: [],
    iterations: 0,
  }

  const addStage = (name: string, output: string) => {
    result.stages.push({ name, output })
  }

  // 0. 运行初始测试确认失败
  if (verifyWithTest && testCommand) {
    const initial = runTestCommand(testCommand, projectRoot)
    if (isTestPassing(initial)) {
      addStage('initial-test', initial)
      result.success = true
      result.verify = { ok: true, testOutput: initial, errors: [] }
      return result
    }
    addStage('initial-test', initial)
  }

  // 1. 构建仓库结构
  addStage('structure', `构建仓库结构 (${projectRoot})`)
  const structure = buildRepoStructure(projectRoot, config.excludeDirs)

  // 2. 生成问题描述（若无，从测试失败推断）
  const problemStatement = problem.trim()
    ? problem
    : buildProblemFromTestFailure(result.stages.find((s) => s.name === 'initial-test')?.output ?? '')

  // 3. 定位 → 修复 → 应用 → 验证 迭代
  let lastVerify: { ok: boolean; output: string; errors: string[] } | null = null

  for (let iter = 0; iter < maxIterations; iter++) {
    result.iterations = iter + 1

    // 3a. 文件级定位 prompt
    const fileLocalizePrompt = buildFileLocalizePrompt(problemStatement, structure, maxFiles)
    addStage(`file-localize-${iter + 1}`, fileLocalizePrompt)

    // 3b. 位置定位 prompt（依赖文件级结果，这里用全部文件生成代码定位 prompt）
    const allFiles = Object.keys(structure.symbols)
    const candidateFiles = allFiles.slice(0, Math.min(10, allFiles.length))
    const fileContents = readProjectFiles(projectRoot, candidateFiles)
    const codeLocalizePrompt = buildCodeLocalizePrompt(problemStatement, fileContents)
    addStage(`code-localize-${iter + 1}`, codeLocalizePrompt)

    // 3c. 修复 prompt（含带行号上下文）
    const repairPrompt = buildRepairPrompt(problemStatement, fileContents, new Map())
    addStage(`repair-${iter + 1}`, repairPrompt)

    // 3d. 用户/外部 LLM 生成 edit_file 命令后，通过 applyEditCommandsOutput 应用
    // （命令层负责将 LLM 输出传入此处）
    addStage(`repair-prompt-${iter + 1}`, '等待 edit_file 命令输出...')

    // 3e. 验证（lint + 测试）
    const errors: string[] = []
    if (lintCommand) {
      const lintOut = runLintCommand(lintCommand, projectRoot)
      addStage(`lint-${iter + 1}`, lintOut)
      if (/error|✖|✗/i.test(lintOut) && !/0 error/i.test(lintOut)) {
        errors.push(lintOut.slice(0, 500))
      }
    }
    if (verifyWithTest && testCommand) {
      const testOut = runTestCommand(testCommand, projectRoot)
      addStage(`test-${iter + 1}`, testOut)
      if (!isTestPassing(testOut)) {
        errors.push(testOut.slice(0, 1000))
      }
    }

    lastVerify = {
      ok: errors.length === 0,
      output: errors.join('\n'),
      errors,
    }

    if (errors.length === 0) {
      result.success = true
      break
    }
  }

  if (lastVerify) {
    result.verify = {
      ok: lastVerify.ok,
      testOutput: lastVerify.output,
      lintOutput: lastVerify.output,
      errors: lastVerify.errors,
    }
  }

  return result
}

// ============================================================================
// 补丁应用入口（供命令层调用）
// ============================================================================

/**
 * 应用 LLM 生成的 edit_file 命令到项目文件。
 *
 * @param llmOutput LLM 输出（含 edit_file 命令）
 * @param projectRoot 项目根目录
 * @returns 补丁结果
 */
export function applyEditCommandsOutput(
  llmOutput: string,
  projectRoot = process.cwd(),
): PatchResult {
  const commands = parseEditCommands(llmOutput)
  // 收集涉及的文件内容
  const files = new Set<string>()
  for (const c of commands) {
    if (c.file) files.add(c.file)
  }
  const fileContents = readProjectFiles(projectRoot, Array.from(files))
  return applyPatch(commands, fileContents)
}

/** 将补丁结果落盘（写回文件） */
export function writePatchResult(
  patch: PatchResult,
  projectRoot = process.cwd(),
): Array<{ file: string; written: boolean }> {
  const result: Array<{ file: string; written: boolean }> = []
  for (const c of patch.contents) {
    try {
      const full = resolve(projectRoot, c.file)
      writeFileSync(full, c.new, 'utf-8')
      result.push({ file: c.file, written: true })
    } catch (e) {
      result.push({ file: c.file, written: false })
    }
  }
  return result
}

// 重新导出供命令层使用
export type { RepoStructure }
export { buildRepoStructure }
export { transferLocsToIntervals }
export { getFileLineCount }
export { isTestFile }
