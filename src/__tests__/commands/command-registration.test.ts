/**
 * 集成测试：验证所有注册的命令都能被 hasCommand 精确匹配
 * 防止出现类似 /asktime 路由到错误技能的问题
 *
 * 核心验证：
 * 1. 通过 getCommands(cwd) 获取所有已注册命令
 * 2. 遍历每个命令，验证 hasCommand(cmd.name, commands) === true
 * 3. 验证每个 alias 也能被 hasCommand 识别
 * 4. 验证 builtInCommandNames 包含所有命令 name 和 alias
 */

import { describe, it, expect } from 'vitest'
import { hasCommand, builtInCommandNames, getCommands } from '../../commands'

describe('command registration - hasCommand integration', () => {
  it('every registered command should be findable by its name', async () => {
    const cmds = await getCommands('/')
    const failures: string[] = []
    for (const cmd of cmds) {
      if (!hasCommand(cmd.name, cmds)) {
        failures.push(cmd.name)
      }
    }
    expect(failures, `这些命令的 name 无法被 hasCommand 匹配: ${failures.join(', ')}`).toEqual([])
  })

  it('every registered command alias should be findable', async () => {
    const cmds = await getCommands('/')
    const failures: Array<{ cmd: string; alias: string }> = []
    for (const cmd of cmds) {
      for (const alias of cmd.aliases ?? []) {
        if (!hasCommand(alias, cmds)) {
          failures.push({ cmd: cmd.name, alias })
        }
      }
    }
    expect(
      failures,
      `这些 alias 无法被 hasCommand 匹配:\n${failures.map(f => `  ${f.cmd} -> ${f.alias}`).join('\n')}`
    ).toEqual([])
  })

  it('should NOT match non-existent command names', async () => {
    const cmds = await getCommands('/')
    const fakeNames = [
      'nonexistent-command',
      'fake-command-12345',
      '__internal_tool',
      'this-should-not-exist',
    ]
    for (const name of fakeNames) {
      expect(hasCommand(name, cmds), `假命令 "${name}" 不应被匹配`).toBe(false)
    }
  })

  it('builtInCommandNames should contain every command name and alias', async () => {
    const cmds = await getCommands('/')
    const builtIn = builtInCommandNames()
    const missing: string[] = []
    for (const cmd of cmds) {
      if (!builtIn.has(cmd.name)) {
        missing.push(cmd.name)
      }
      for (const alias of cmd.aliases ?? []) {
        if (!builtIn.has(alias)) {
          missing.push(`${cmd.name} (alias: ${alias})`)
        }
      }
    }
    expect(missing, `builtInCommandNames 缺少以下命令:\n${missing.join('\n')}`).toEqual([])
  })

  it('should handle known edge case commands correctly', async () => {
    const cmds = await getCommands('/')
    // 这些是已知的、容易被脚本误判的命令
    const knownEdgeCases = [
      { name: 'ctx_viz', reason: '下划线命名（非 kebab-case）' },
      { name: 'asktime', reason: '新创建的命令' },
      { name: 'auto-mode-reset', reason: '带连字符的命令' },
      { name: 'health-score', reason: '描述含 emoji' },
      { name: 'mcp-discovery', reason: '目录名和 name 一致' },
    ]
    for (const { name } of knownEdgeCases) {
      expect(hasCommand(name, cmds), `边缘用例命令 "${name}" 应可被匹配`).toBe(true)
    }
  })
})
