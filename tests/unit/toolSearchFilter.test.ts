import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  filterToolsForMessage,
  filterSkillsForMessage,
  isSimpleConversationMessage,
  ALWAYS_ON_TOOLS,
  clearToolFilterCache,
} from '../../src/utils/toolSearch.js'
import type { Tool } from '../../src/Tool.js'
import type { Command } from '../../src/types/command.js'

// Minimal mock tools for testing
const mockTools: Tool[] = [
  {
    name: 'AgentTool',
    isEnabled: () => true,
    isMcp: false,
    info: () => ({ name: 'AgentTool', description: 'test', parameters: { type: 'object', properties: {} }, required: [] }),
    userFacingName: () => 'AgentTool',
    prompt: async () => 'Agent prompt',
    call: async () => ({}, {} as any),
    checkPermissions: () => Promise.resolve({ behavior: 'allow' } as any),
    toAutoClassifierInput: () => '',
    mapToolResultToToolResultBlockParam: () => ({ type: 'tool_result' as const, content: '' }),
  } as unknown as Tool,
  {
    name: 'BashTool',
    isEnabled: () => true,
    isMcp: false,
    info: () => ({ name: 'BashTool', description: 'test', parameters: { type: 'object', properties: {} }, required: [] }),
    userFacingName: () => 'BashTool',
    prompt: async () => 'Bash prompt',
    call: async () => ({}, {} as any),
    checkPermissions: () => Promise.resolve({ behavior: 'allow' } as any),
    toAutoClassifierInput: () => '',
    mapToolResultToToolResultBlockParam: () => ({ type: 'tool_result' as const, content: '' }),
  } as unknown as Tool,
  {
    name: 'FileReadTool',
    isEnabled: () => true,
    isMcp: false,
    info: () => ({ name: 'FileReadTool', description: 'test', parameters: { type: 'object', properties: {} }, required: [] }),
    userFacingName: () => 'FileReadTool',
    prompt: async () => 'Read prompt',
    call: async () => ({}, {} as any),
    checkPermissions: () => Promise.resolve({ behavior: 'allow' } as any),
    toAutoClassifierInput: () => '',
    mapToolResultToToolResultBlockParam: () => ({ type: 'tool_result' as const, content: '' }),
  } as unknown as Tool,
  {
    name: 'GrepTool',
    isEnabled: () => true,
    isMcp: false,
    info: () => ({ name: 'GrepTool', description: 'test', parameters: { type: 'object', properties: {} }, required: [] }),
    userFacingName: () => 'GrepTool',
    prompt: async () => 'Grep prompt',
    call: async () => ({}, {} as any),
    checkPermissions: () => Promise.resolve({ behavior: 'allow' } as any),
    toAutoClassifierInput: () => '',
    mapToolResultToToolResultBlockParam: () => ({ type: 'tool_result' as const, content: '' }),
  } as unknown as Tool,
  {
    name: 'Mcp__ExampleServer_ReadFile',
    isEnabled: () => true,
    isMcp: true,
    info: () => ({ name: 'Mcp__ExampleServer_ReadFile', description: 'MCP test', parameters: { type: 'object', properties: {} }, required: [] }),
    userFacingName: () => 'Mcp__ExampleServer_ReadFile',
    prompt: async () => 'MCP prompt',
    call: async () => ({}, {} as any),
    checkPermissions: () => Promise.resolve({ behavior: 'allow' } as any),
    toAutoClassifierInput: () => '',
    mapToolResultToToolResultBlockParam: () => ({ type: 'tool_result' as const, content: '' }),
  } as unknown as Tool,
]

describe('isSimpleConversationMessage', () => {
  it('should detect simple greetings', () => {
    expect(isSimpleConversationMessage('hi')).toBe(true)
    expect(isSimpleConversationMessage('hello')).toBe(true)
    expect(isSimpleConversationMessage('hello there')).toBe(true)
    expect(isSimpleConversationMessage('HI')).toBe(true)
    expect(isSimpleConversationMessage('ok')).toBe(true)
    expect(isSimpleConversationMessage('thanks')).toBe(true)
  })

  it('should detect small talk', () => {
    expect(isSimpleConversationMessage('how are you')).toBe(true)
    expect(isSimpleConversationMessage('how are you doing')).toBe(true)
    expect(isSimpleConversationMessage('thanks a lot')).toBe(true)
  })

  it('should NOT detect code-related messages as simple', () => {
    expect(isSimpleConversationMessage('read the file')).toBe(false)
    expect(isSimpleConversationMessage('run a test')).toBe(false)
    expect(isSimpleConversationMessage('git status')).toBe(false)
  })

  it('should detect simple Chinese greetings', () => {
    expect(isSimpleConversationMessage('你好')).toBe(true)
    expect(isSimpleConversationMessage('哈喽')).toBe(true)
    expect(isSimpleConversationMessage('最近怎么样')).toBe(true)
    expect(isSimpleConversationMessage('谢谢')).toBe(true)
    expect(isSimpleConversationMessage('好的')).toBe(true)
    expect(isSimpleConversationMessage('再见')).toBe(true)
  })

  it('should NOT detect Chinese code-related messages as simple', () => {
    expect(isSimpleConversationMessage('读取文件')).toBe(false)
    expect(isSimpleConversationMessage('运行测试')).toBe(false)
    expect(isSimpleConversationMessage('修复 bug')).toBe(false)
  })
})

describe('filterToolsForMessage', () => {
  beforeEach(() => {
    clearToolFilterCache()
  })

  afterEach(() => {
    clearToolFilterCache()
  })

  it('should return only always-on tools for simple greetings', () => {
    const filtered = filterToolsForMessage(mockTools, 'hi')
    // For "hi", only ALWAYS_ON_TOOLS should be returned (plus MCP tools)
    expect(filtered.length).toBeLessThan(mockTools.length)
    // AgentTool is in ALWAYS_ON_TOOLS and is in mockTools
    expect(filtered.some(t => t.name === 'AgentTool')).toBe(true)
    // Code tools like FileReadTool should NOT be included for "hi"
    expect(filtered.some(t => t.name === 'FileReadTool')).toBe(false)
  })

  it('should include keyword-matched tools', () => {
    const filtered = filterToolsForMessage(mockTools, 'read the config file')
    expect(filtered.some(t => t.name === 'FileReadTool')).toBe(true)
    expect(filtered.some(t => ALWAYS_ON_TOOLS.has(t.name))).toBe(true)
  })

  it('should include grep tool for English search keywords', () => {
    const filtered = filterToolsForMessage(mockTools, 'search for TODO comments')
    expect(filtered.some(t => t.name === 'GrepTool')).toBe(true)
  })

  it('should include tools for Chinese keywords', () => {
    const filtered = filterToolsForMessage(mockTools, '读取 file.ts')
    expect(filtered.some(t => t.name === 'FileReadTool')).toBe(true)
  })

  it('should skip MCP tools for simple greetings', () => {
    const filtered = filterToolsForMessage(mockTools, 'hi')
    expect(filtered.some(t => t.name === 'Mcp__ExampleServer_ReadFile')).toBe(false)
  })

  it('should include MCP tools for non-simple messages', () => {
    const filtered = filterToolsForMessage(mockTools, 'read the file')
    expect(filtered.some(t => t.name === 'Mcp__ExampleServer_ReadFile')).toBe(true)
    expect(filtered.find(t => t.name === 'Mcp__ExampleServer_ReadFile')!.isMcp).toBe(true)
  })

  it('should cache results for same message', () => {
    const result1 = filterToolsForMessage(mockTools, 'read file.ts')
    const result2 = filterToolsForMessage(mockTools, 'read file.ts')
    // Same tools returned (cached name set used)
    expect(result1.map(t => t.name)).toEqual(result2.map(t => t.name))
  })

  it('should not cache results for different toolsets', () => {
    const subset = mockTools.slice(0, 3) // Fewer tools
    const result1 = filterToolsForMessage(mockTools, 'hi')
    const result2 = filterToolsForMessage(subset, 'hi')
    expect(result1.length).toBeGreaterThanOrEqual(result2.length)
  })
})

describe('filterSkillsForMessage', () => {
  const skill = (
    name: string,
    loadedFrom: Command['loadedFrom'],
    desc = '',
    whenToUse = '',
  ): Command =>
    ({
      name,
      loadedFrom,
      description: desc,
      whenToUse,
      type: 'prompt',
      source: 'plugin',
    }) as unknown as Command

  it('keeps bundled and MCP skills regardless of message', () => {
    const cmds = [
      skill('bundled-skill', 'bundled'),
      skill('mcp-skill', 'mcp'),
      skill('my-tail-skill', 'skills', 'nothing related'),
    ]
    const result = filterSkillsForMessage(cmds, 'read the file')
    expect(result.map(c => c.name)).toEqual(
      expect.arrayContaining(['bundled-skill', 'mcp-skill']),
    )
  })

  it('drops tail skills with no token overlap', () => {
    const cmds = [
      skill('bundled-skill', 'bundled'),
      skill('my-tail-skill', 'skills', 'fix postgres migrations'),
    ]
    const result = filterSkillsForMessage(cmds, 'write a react component')
    expect(result.some(c => c.name === 'my-tail-skill')).toBe(false)
  })

  it('includes tail skills whose description matches a message token', () => {
    const cmds = [
      skill('bundled-skill', 'bundled'),
      skill('migration-helper', 'skills', 'fix postgres migrations'),
      skill('unrelated-skill', 'skills', 'design logos'),
    ]
    const result = filterSkillsForMessage(cmds, 'help me fix postgres migrations')
    expect(result.some(c => c.name === 'migration-helper')).toBe(true)
    expect(result.some(c => c.name === 'unrelated-skill')).toBe(false)
  })

  it('matches Chinese tokens (single-character preserved)', () => {
    const cmds = [
      skill('bundled-skill', 'bundled'),
      skill('迁移助手', 'skills', '数据库迁移'),
      skill('unrelated', 'skills', 'design'),
    ]
    const result = filterSkillsForMessage(cmds, '帮我做数据库迁移')
    expect(result.some(c => c.name === '迁移助手')).toBe(true)
    expect(result.some(c => c.name === 'unrelated')).toBe(false)
  })

  it('ignores stopwords and short English tokens', () => {
    const cmds = [
      skill('bundled-skill', 'bundled'),
      skill('the-helper', 'skills', 'the'),
    ]
    // "the" 是停用词，不应匹配任何长尾技能
    const result = filterSkillsForMessage(cmds, 'the a hi')
    expect(result.some(c => c.name === 'the-helper')).toBe(false)
  })

  it('dedups bundled core vs tail by name', () => {
    const cmds = [
      skill('dup', 'bundled', 'bundled desc'),
      skill('dup', 'skills', 'tail desc'),
    ]
    const result = filterSkillsForMessage(cmds, 'tail')
    expect(result.filter(c => c.name === 'dup')).toHaveLength(1)
  })
})
