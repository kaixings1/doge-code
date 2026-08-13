/**
 * commands/swe-fix/index.ts — 测试驱动修复命令（SWE-bench 风格）
 *
 * 吸收自 Agentless 定位→修复流水线。用法：
 *   /swe-fix                     运行测试 → 生成定位/修复 prompt
 *   /swe-fix "<issue描述>"       用 issue 文本驱动
 *   /swe-fix --test-only         只运行测试并解析失败
 *   /swe-fix --localize          只生成定位 prompt
 *   /swe-fix --repair            生成修复 prompt（含带行号上下文）
 *   /swe-fix --apply "<输出>"    应用 LLM 生成的 edit_file 命令
 *   /swe-fix --verify            验证补丁（lint + test）
 *   /swe-fix --structure         展示仓库结构
 *   /swe-fix --help              帮助
 *
 * 工作流：
 *   1. /swe-fix             → 生成文件定位 + 位置定位 + 修复 3 段 prompt
 *   2. 把 prompt 发给 LLM → 得到 edit_file 命令
 *   3. /swe-fix --apply "<LLM输出>" → 应用到文件
 *   4. /swe-fix --verify    → 运行测试确认修复
 */

import type { Command } from '../../commands.js'
import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'
import {
  runFixLoop,
  detectTestCommand,
  runTestCommand,
  parseTestFailures,
  isTestPassing,
  applyEditCommandsOutput,
  writePatchResult,
  buildRepoStructure,
} from '../../engine/testDrivenFix/fixLoop.js'
import {
  buildFileLocalizePrompt,
  buildCodeLocalizePrompt,
  buildRepairPrompt,
} from '../../engine/testDrivenFix/localize.js'
import { formatRepoStructure } from '../../engine/testDrivenFix/localize.js'
import { readProjectFiles } from '../../engine/testDrivenFix/repoStructure.js'
import { parseYaml } from '../../utils/yaml.js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { StrategyTemplate } from '../../engine/testDrivenFix/types.js'

// ============================================================================
// Strategy template loader（吸收自 SWE-agent config/）
// ============================================================================

function loadStrategy(name: string): StrategyTemplate | null {
  const file = join(import.meta.dirname, 'agent-strategies', name + '.yaml')
  if (!existsSync(file)) return null
  const raw = readFileSync(file, 'utf-8')
  return parseYaml(raw) as StrategyTemplate
}

// ============================================================================
// Help
// ============================================================================

function renderHelp(): string {
  return [
    '# SWE-Fix — 测试驱动修复（吸收自 Agentless）',
    '',
    '❌ 错误: SWE-bench 风格定位→修复闭环：测试失败 → 定位 → 修复 → 验证。',
    '',
    '## 用法',
    '```',
    '/swe-fix <issue描述>   运行测试并生成定位+修复 prompt',
    '❌ 错误: /swe-fix --test-only    只运行测试并解析失败信息',
    '/swe-fix --localize     生成文件级定位 prompt',
    '/swe-fix --repair       生成修复 prompt（带行号上下文）',
    '/swe-fix --structure    展示仓库结构',
    '/swe-fix --apply "<输出>"  应用 LLM 生成的 edit_file 命令',
    '/swe-fix --verify       运行测试验证补丁',
    '```',
    '',
    '## 工作流',
    '```',
    '1. /swe-fix                 → 复制输出的 3 段 prompt',
    '2. 发给 LLM → 得到 edit_file 命令',
    '3. /swe-fix --apply "<输出>" → 应用到文件',
    '4. /swe-fix --verify        → 运行测试确认',
    '```',
    '',
    '## 选项',
    '| 选项 | 说明 |',
    '|------|------|',
    '❌ 错误: | `--test-only` | 只运行测试，输出失败解析 |',
    '| `--localize` | 文件级定位 prompt |',
    '| `--repair` | 修复 prompt（含带行号代码） |',
    '| `--structure` | 仓库结构概览 |',
    '| `--apply` | 应用 edit_file 补丁 |',
    '| `--verify` | 运行测试验证 |',
    '| `--max-iter <n>` | 最大迭代轮数（默认 3） |',
    '| `--strategy <name>` | 使用 SWE-agent 策略模板（default / default-backticks / bash-only / coding-challenge） |',
  ].join('\n')
}

// ============================================================================
// Main
// ============================================================================

export const call: LocalCommandCall = async (args): Promise<LocalCommandResult> => {
  const raw = (args ?? '').trim()
  const projectRoot = process.cwd()

  if (!raw || raw === '--help' || raw === 'help') {
    return { type: 'text', value: renderHelp() }
  }

  const testCommand = detectTestCommand(projectRoot)
  const testCmdLabel = testCommand || '未检测到测试框架'

  // --strategy：加载 SWE-agent 策略模板
  let strategy: StrategyTemplate | null = null
  const strategyMatch = raw.match(/--strategy\s+(\S+)/)
  if (strategyMatch) {
    strategy = loadStrategy(strategyMatch[1])
    if (!strategy) {
      return { type: 'text', value: '❌ 未找到策略模板: ' + strategyMatch[1] + '\n可用: default, default-backticks, bash-only, coding-challenge' }
    }
  }

  // --structure：展示仓库结构
  if (raw === '--structure') {
    const structure = buildRepoStructure(projectRoot)
    const files = Object.keys(structure.symbols)
    const testCount = structure.testFiles.length
    return {
      type: 'text',
      value: [
        `仓库结构: ${files.length} 个代码文件, ${testCount} 个测试文件`,
        `测试命令: ${testCmdLabel}`,
        '',
        formatRepoStructure(structure, 100),
      ].join('\n'),
    }
  }

  // --test-only：只运行测试并解析失败
  if (raw === '--test-only') {
    if (!testCommand) {
      return { type: 'text', value: '未检测到测试框架，无法运行测试' }
    }
    const output = runTestCommand(testCommand, projectRoot)
    const passing = isTestPassing(output)
    const failures = parseTestFailures(output)
    return {
      type: 'text',
      value: [
        `# 测试结果: ${passing ? '✅ 全部通过' : `❌ ${failures.length} 个失败`}`,
        '',
        output.slice(0, 3000),
        '',
        '## 失败解析',
        failures.length === 0
          ? '(未解析出结构化失败)'
          : failures.map((f, i) => [
              `### ${i + 1}. ${f.testName ?? f.file ?? 'unknown'}`,
              `文件: ${f.file ?? '-'}`,
              f.message ? `错误: ${f.message}` : '',
            ].join('\n')).join('\n\n'),
      ].join('\n'),
    }
  }

  // --verify：运行测试验证
  if (raw === '--verify') {
    if (!testCommand) {
      return { type: 'text', value: '未检测到测试框架' }
    }
    const output = runTestCommand(testCommand, projectRoot)
    const passing = isTestPassing(output)
    return {
      type: 'text',
      value: `❌ # 验证结果: ${passing ? '✅ 通过' : '❌ 失败'}\n\n${output.slice(0, 4000)}`,
    }
  }

  // --apply：应用 edit_file 命令
  if (raw.startsWith('--apply')) {
    const llmOutput = raw.slice('--apply'.length).trim()
    if (!llmOutput) {
      return { type: 'text', value: '用法: /swe-fix --apply "<LLM 输出的 edit_file 命令>"' }
    }
    const patch = applyEditCommandsOutput(llmOutput, projectRoot)
    if (patch.contents.length === 0) {
      return {
        type: 'text',
        value: [
          '未解析到可应用的 edit_file 命令。',
          '',
          '提示：LLM 输出需包含以下格式：',
          '```python',
          "edit_file('src/foo.ts', 10, 12, 'new content')",
          '```',
        ].join('\n'),
      }
    }
    const written = writePatchResult(patch, projectRoot)
    return {
      type: 'text',
      value: [
        `# 补丁应用结果`,
        `应用命令: ${patch.appliedCount} 个，修改文件: ${patch.contents.length} 个`,
        '',
        ...written.map((w) => `  ${w.written ? '✅' : '❌'} ${w.file}`),
        '',
        patch.failedCommands.length > 0
          ? `## 未应用 (${patch.failedCommands.length})\n` +
            patch.failedCommands.slice(0, 5).map((f) =>
              `  ❌ ${f.command.file}:${f.command.start}-${f.command.end} — ${f.reason}`,
            ).join('\n')
          : '',
        '',
        '运行 /swe-fix --verify 验证修复。',
      ].join('\n'),
    }
  }

  // --localize：文件级定位 prompt
  if (raw === '--localize' || raw.startsWith('--localize ')) {
    const problem = raw.replace(/^--localize\s*/, '')
    if (!problem) {
      return { type: 'text', value: '用法: /swe-fix --localize "<issue 描述>"❌ 错误:  或先运行 /swe-fix 获取失败信息' }
    }
    const structure = buildRepoStructure(projectRoot)
    return {
      type: 'text',
      value: strategy
        ? buildFileLocalizePrompt(problem, structure, 200, strategy)
        : buildFileLocalizePrompt(problem, structure, 200),
    }
  }

  // --repair：修复 prompt（含带行号上下文）
  if (raw === '--repair' || raw.startsWith('--repair ')) {
    const problem = raw.replace(/^--repair\s*/, '')
    if (!problem) {
      return { type: 'text', value: '用法: /swe-fix --repair "<issue 描述>"' }
    }
    const structure = buildRepoStructure(projectRoot)
    const files = Object.keys(structure.symbols).slice(0, 5)
    const fileContents = readProjectFiles(projectRoot, files)
    return {
      type: 'text',
      value: [
        strategy
          ? buildCodeLocalizePrompt(problem, fileContents, 300, strategy)
          : buildCodeLocalizePrompt(problem, fileContents, 300),
        '',
        '---',
        '',
        strategy
          ? buildRepairPrompt(problem, fileContents, new Map(), true, strategy)
          : buildRepairPrompt(problem, fileContents, new Map(), true),
      ].join('\n'),
    }
  }

  // 默认：完整闭环（测试 → 定位 → 修复 prompt）
  const problem = raw.startsWith('"') && raw.endsWith('"')
    ? raw.slice(1, -1)
    : raw

  const fixLoopConfig: Record<string, unknown> = { projectRoot }
  if (strategy) fixLoopConfig.strategyTemplate = strategy
  const result = await runFixLoop(problem, fixLoopConfig)
  const stages = result.stages.map((s) => `## ${s.name}\n${s.output.slice(0, 2000)}`).join('\n\n')
  const verify = result.verify

  return {
    type: 'text',
    value: [
      `# SWE-Fix 闭环结果 (${result.iterations} 轮)`,
      `成功: ${result.success ? '✅' : '❌'}`,
      verify ? `验证: ${verify.ok ? '✅ 通过' : '❌ 失败'}` : '',
      '',
      stages,
      '',
      '## 下一步',
      '将上面的 "file-localize" / "code-localize" / "repair" prompt 发给 LLM，',
      '得到 edit_file 命令后用 /swe-fix --apply 应用，再 /swe-fix --verify 验证。',
    ].join('\n'),
  }
}

const sweFix = {
  type: 'local',
  name: 'swe-fix',
  description: 'SWE-bench 风格测试驱动修复：定位→修复→验证闭环（吸收自 Agentless）',
  aliases: ['/swe-fix', '/tfix'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default sweFix
