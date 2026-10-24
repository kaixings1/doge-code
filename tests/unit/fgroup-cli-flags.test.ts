import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  parsePermissionPromptsMode,
  permissionPromptsMode,
} from '../../src/utils/permissions/permissionPromptsMode.js'
import {
  getDeferredDynamicSections,
  isDynamicSectionsExcluded,
} from '../../src/constants/prompts.js'

/**
 * F 组两个 CLI 参数（对齐官方 v2.1.98 / v2.1.259）
 *
 *  --exclude-dynamic-system-prompt-sections：动态段落移出系统提示词
 *  --permission-prompts <host|none>：none 时需弹窗的调用自动拒绝
 */

describe('--permission-prompts 取值解析', () => {
  afterEach(() => {
    delete process.env.CLAUDE_CODE_PERMISSION_PROMPTS
  })

  it('默认 host', () => {
    expect(parsePermissionPromptsMode(undefined).mode).toBe('host')
    expect(parsePermissionPromptsMode(undefined).valid).toBe(true)
  })

  it('none / host 均合法，大小写不敏感', () => {
    expect(parsePermissionPromptsMode('none')).toEqual({ mode: 'none', valid: true })
    expect(parsePermissionPromptsMode('NONE')).toEqual({ mode: 'none', valid: true })
    expect(parsePermissionPromptsMode('host')).toEqual({ mode: 'host', valid: true })
  })

  it('非法值回落到 host 并标记无效（不能让拼写错误导致全部拒绝）', () => {
    for (const bad of ['nope', 'always', '1', 'nx']) {
      const r = parsePermissionPromptsMode(bad)
      expect(r.mode, 'value=' + bad).toBe('host')
      expect(r.valid, 'value=' + bad).toBe(false)
    }
  })

  it('permissionPromptsMode 读取环境变量', () => {
    process.env.CLAUDE_CODE_PERMISSION_PROMPTS = 'none'
    expect(permissionPromptsMode()).toBe('none')
    process.env.CLAUDE_CODE_PERMISSION_PROMPTS = 'bogus'
    expect(permissionPromptsMode()).toBe('host')
  })
})

describe('--exclude-dynamic-system-prompt-sections', () => {
  afterEach(() => {
    delete process.env.CLAUDE_CODE_EXCLUDE_DYNAMIC_SYSTEM_PROMPT_SECTIONS
  })

  it('未设置时关闭', () => {
    delete process.env.CLAUDE_CODE_EXCLUDE_DYNAMIC_SYSTEM_PROMPT_SECTIONS
    expect(isDynamicSectionsExcluded()).toBe(false)
  })

  it('设为 1/true 时开启', () => {
    for (const v of ['1', 'true', 'yes', 'on']) {
      process.env.CLAUDE_CODE_EXCLUDE_DYNAMIC_SYSTEM_PROMPT_SECTIONS = v
      expect(isDynamicSectionsExcluded(), 'value=' + v).toBe(true)
    }
  })

  it('设为 0/false 时关闭', () => {
    for (const v of ['0', 'false', 'no']) {
      process.env.CLAUDE_CODE_EXCLUDE_DYNAMIC_SYSTEM_PROMPT_SECTIONS = v
      expect(isDynamicSectionsExcluded(), 'value=' + v).toBe(false)
    }
  })

  it('默认没有推迟段落（未生成过系统提示词时为空）', () => {
    expect(getDeferredDynamicSections()).toEqual([])
  })
})

describe('CLI 参数已注册', () => {
  it('main.tsx 中存在两个新参数', async () => {
    const { readFileSync } = await import('fs')
    const src = readFileSync('D:/doge-code/src/main.tsx', 'utf8')
    expect(src).toContain('--exclude-dynamic-system-prompt-sections')
    expect(src).toContain('--permission-prompts <host|none>')
  })

  it('两个参数会写入对应环境变量', async () => {
    const { readFileSync } = await import('fs')
    const src = readFileSync('D:/doge-code/src/main.tsx', 'utf8')
    expect(src).toContain('CLAUDE_CODE_EXCLUDE_DYNAMIC_SYSTEM_PROMPT_SECTIONS')
    expect(src).toContain('CLAUDE_CODE_PERMISSION_PROMPTS')
  })
})
