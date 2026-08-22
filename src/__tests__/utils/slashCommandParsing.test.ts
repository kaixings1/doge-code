import { describe, it, expect } from 'vitest'
import { parseSlashCommand, getCommandTrigger } from '../../utils/slashCommandParsing'

describe('slashCommandParsing - extended triggers', () => {
  describe('getCommandTrigger', () => {
    it.each([
      ['/', '/commit', '/'],
      ['>', '>plan', '>'],
      ['<', '<langgraph', '<'],
      ['@', '@debug', '@'],
      ['#', '#todo', '#'],
      ['&', '&analyze', '&'],
      ['|', '|grep error', '|'],
      ['$', '$2+2', '$'],
      ['=', '=base_url=xxx', '='],
      ['^', '^grep error', '^'],
      ['%', '%main', '%'],
      ['no trigger', 'regular text', ''],
      ['space prefix', ' /cmd', '/'],
    ])('returns %s for "%s"', (name, input, expected) => {
      expect(getCommandTrigger(input)).toBe(expected)
    })
  })

  describe('parseSlashCommand', () => {
    it.each([
      ['/commit --amend', { commandName: 'commit', args: '--amend', isMcp: false }],
      ['>plan', { commandName: 'plan', args: '', isMcp: false }],
      ['<langgraph', { commandName: 'langgraph', args: '', isMcp: false }],
      ['@debug 登录接口报错', { commandName: 'debug', args: '登录接口报错', isMcp: false }],
      ['#todo', { commandName: 'todo', args: '', isMcp: false }],
      ['&analyze', { commandName: 'analyze', args: '', isMcp: false }],
      ['|grep error', { commandName: 'grep', args: 'error', isMcp: false }],
      ['$2+2', { commandName: '2+2', args: '', isMcp: false }],
      ['=base_url=xxx', { commandName: 'base_url=xxx', args: '', isMcp: false }],
      ['^grep error', { commandName: 'grep', args: 'error', isMcp: false }],
      ['%main', { commandName: 'main', args: '', isMcp: false }],
      ['/commit (MCP)', { commandName: 'commit (MCP)', args: '', isMcp: true }],
      ['regular text', null],
      ['', null],
    ])('parses "%s" correctly', (input, expected) => {
      expect(parseSlashCommand(input)).toEqual(expected)
    })
  })
})
