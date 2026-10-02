import { describe, it, expect } from 'vitest'
import { PathGuard } from '../../security/PathGuard'

describe('PathGuard', () => {
  const guard = new PathGuard({ rootDir: '/home/user/project' })

  describe('empty path', () => {
    it('rejects empty string', () => {
      const result = guard.validate('')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('Path is empty')
    })

    it('rejects whitespace-only path', () => {
      const result = guard.validate('   ')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('Path is empty')
    })
  })

  describe('path traversal', () => {
    it('rejects ../ escape attempt', () => {
      const result = guard.validate('../../etc/passwd')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('检测到路径遍历：逃逸出根目录')
    })

    it('allows safe relative paths', () => {
      const result = guard.validate('src/index.ts')
      expect(result.allowed).toBe(true)
    })
  })

  describe('blocked directories', () => {
    it('rejects .git', () => {
      const result = guard.validate('.git/config')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('.git')
    })

    it('rejects node_modules', () => {
      const result = guard.validate('node_modules/pkg/index.js')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('node_modules')
    })

    it('rejects .env', () => {
      const result = guard.validate('.env')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('.env')
    })

    it('rejects .ssh', () => {
      const result = guard.validate('.ssh/id_rsa')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('.ssh')
    })
  })

  describe('blocked extensions', () => {
    it('rejects .exe', () => {
      const result = guard.validate('app.exe')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('.exe')
    })

    it('rejects .bat', () => {
      const result = guard.validate('script.bat')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('.bat')
    })

    it('rejects .ps1', () => {
      const result = guard.validate('script.ps1')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('.ps1')
    })

    it('allows .ts files', () => {
      const result = guard.validate('index.ts')
      expect(result.allowed).toBe(true)
    })

    it('allows .json files', () => {
      const result = guard.validate('config.json')
      expect(result.allowed).toBe(true)
    })
  })

  describe('allowed dirs', () => {
    it('allows paths in allowed dirs when configured', () => {
      const g = new PathGuard({
        rootDir: '/home/user/project',
        allowedDirs: ['/home/user/project/src'],
      })
      const result = g.validate('/home/user/project/src/index.ts')
      expect(result.allowed).toBe(true)
    })

    it('rejects paths outside allowed dirs when configured', () => {
      const g = new PathGuard({
        rootDir: '/home/user/project',
        allowedDirs: ['/home/user/project/src'],
      })
      const result = g.validate('/home/user/project/docs/readme.md')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('路径不在允许的目录中')
    })
  })

  describe('custom config', () => {
    it('respects custom blocked extensions', () => {
      const g = new PathGuard({
        rootDir: '/home/user/project',
        blockedExtensions: ['.zip', '.tar.gz'],
      })
      expect(g.validate('backup.zip').allowed).toBe(false)
      expect(g.validate('readme.md').allowed).toBe(true)
    })

    it('respects custom allowed extensions', () => {
      const g = new PathGuard({
        rootDir: '/home/user/project',
        allowedExtensions: ['.ts', '.tsx'],
      })
      expect(g.validate('app.ts').allowed).toBe(true)
      expect(g.validate('app.js').allowed).toBe(false)
    })
  })

  describe('addAllowedDir / addBlockedDir', () => {
    it('adds allowed dir dynamically', () => {
      const g = new PathGuard({ rootDir: '/home/user/project' })
      g.addAllowedDir('/home/user/project/tests')
      const result = g.validate('/home/user/project/tests/foo.test.ts')
      expect(result.allowed).toBe(true)
    })

    it('adds blocked dir dynamically', () => {
      const g = new PathGuard({ rootDir: '/home/user/project' })
      g.addBlockedDir('secrets')
      const result = g.validate('secrets/api.key')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('secrets')
    })
  })
})
