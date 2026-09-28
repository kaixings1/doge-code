import { describe, it, expect, beforeEach } from 'vitest'
import { PermissionManager } from '../../security/PermissionManager'

describe('PermissionManager', () => {
  let pm: PermissionManager

  beforeEach(() => {
    pm = new PermissionManager()
  })

  describe('checkPermission', () => {
    it('returns default decision when no rules match', () => {
      const decision = pm.checkPermission({
        tool: 'UnknownTool',
        action: 'do-something',
        params: {},
      })
      expect(decision).toBe('ask')
    })

    it('returns allow when rule matches', () => {
      pm.addRule({
        tool: 'FileReadTool',
        pattern: 'read',
        decision: 'allow',
      })
      const decision = pm.checkPermission({
        tool: 'FileReadTool',
        action: 'read',
        params: { path: '/tmp/test.txt' },
      })
      expect(decision).toBe('allow')
    })

    it('returns deny when rule matches', () => {
      pm.addRule({
        tool: 'WriteTool',
        pattern: 'write',
        decision: 'deny',
      })
      const decision = pm.checkPermission({
        tool: 'WriteTool',
        action: 'write',
        params: { path: '/etc/passwd' },
      })
      expect(decision).toBe('deny')
    })

    it('matches wildcard tool', () => {
      pm.addRule({
        tool: '*',
        pattern: '*',
        decision: 'allow',
      })
      expect(pm.checkPermission({ tool: 'AnyTool', action: 'anything', params: {} })).toBe('allow')
    })
  })

  describe('grant / revoke', () => {
    it('grants session-level permission', () => {
      pm.grant(
        { tool: 'WriteTool', action: 'write', params: {}, path: '/tmp/test.txt' },
        'allow_once'
      )
      expect(pm.checkPermission({
        tool: 'WriteTool',
        action: 'write',
        params: {},
        path: '/tmp/test.txt',
      })).toBe('allow_once')
    })

    it('persists rule when persistent=true', () => {
      pm.grant(
        { tool: 'ReadTool', action: 'read', params: {} },
        'allow',
        true
      )
      expect(pm.checkPermission({ tool: 'ReadTool', action: 'read', params: {} })).toBe('allow')
    })

    it('removes rule via removeRule', () => {
      pm.addRule({
        tool: 'ReadTool',
        pattern: 'read',
        decision: 'allow',
        id: 'rule-1',
      })
      expect(pm.checkPermission({ tool: 'ReadTool', action: 'read', params: {} })).toBe('allow')
      pm.removeRule('rule-1')
      expect(pm.checkPermission({ tool: 'ReadTool', action: 'read', params: {} })).toBe('ask')
    })
  })

  describe('getRules', () => {
    it('returns a copy of rules', () => {
      pm.addRule({
        tool: 'ReadTool',
        pattern: 'read',
        decision: 'allow',
        id: 'rule-1',
      })
      const rules = pm.getRules()
      expect(rules).toHaveLength(1)
      expect(rules[0].id).toBe('rule-1')
      // Mutating returned array should not affect internal rules
      rules.pop()
      expect(pm.getRules()).toHaveLength(1)
    })
  })
})
