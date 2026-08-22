import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/install-github-app/index'

describe('install-github-app', () => {
  describe('installGitHubApp', () => {
      it('should be defined', () => { expect(mod.installGitHubApp).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.installGitHubApp).not.toBe(void 0) })
  })
})
