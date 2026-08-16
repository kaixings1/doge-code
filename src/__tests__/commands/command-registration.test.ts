/**
 * 集成测试：验证所有注册的命令都能被 hasCommand 精确匹配
 * 防止出现类似 /asktime 路由到错误技能的问题
 *
 * 测试逻辑：
 * 1. 通过 getCommands(cwd) 获取所有已注册命令
 * 2. 遍历每个命令，验证 hasCommand(cmd.name, commands) === true
 * 3. 验证每个 alias 也能被 hasCommand 识别
 * 4. 验证未注册的名称不会被误匹配
 * 5. 验证 builtInCommandNames 包含所有命令 name 和 alias
 */

import { describe, it, expect, vi } from 'vitest'
import { hasCommand, builtInCommandNames, getCommands } from '../../commands'

describe('command registration - hasCommand integration', () => {
  let commands: ReturnType<typeof getCommands> | null = null

  // 使用 vi.mock 或直接调用 getCommands
  // getCommands 是 async 的，需要在 beforeAll 中获取
  const setup = async () => {
    if (!commands) {
      commands = await getCommands('/')
    }
    return commands
  }

  it('every registered command should be findable by its name', async () => {
    const cmds = await setup()
    const failures: string[] = []
    for (const cmd of cmds) {
      if (!hasCommand(cmd.name, cmds)) {
        failures.push(cmd.name)
      }
    }
    expect(failures, `这些命令的 name 无法被 hasCommand 匹配: ${failures.join(', ')}`).toEqual([])
  })

  it('every registered command alias should be findable', async () => {
    const cmds = await setup()
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
    const cmds = await setup()
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

  it('all commands should have unique names', async () => {
    const cmds = await setup()
    const names = cmds.map(c => c.name)
    const unique = new Set(names)
    expect(unique.size, `发现重复的命令名，共 ${names.length} 个命令，只有 ${unique.size} 个唯一名`).toBe(names.length)
  })

  it('all command names should match kebab-case pattern', async () => {
    const cmds = await setup()
    const invalid: string[] = []
    for (const cmd of cmds) {
      if (!/^[a-z][a-z0-9-]*$/.test(cmd.name)) {
        invalid.push(`${cmd.name} (不符合命名规范)`)
      }
    }
    expect(invalid, `这些命令名不符合 kebab-case 命名规范:\n${invalid.join('\n')}`).toEqual([])
  })

  it('builtInCommandNames should contain every command name', async () => {
    const cmds = await setup()
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
})
