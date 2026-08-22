import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/reload-plugins/index'

describe('reload-plugins', () => {
  describe('reloadPlugins', () => {
      it('should be defined', () => { expect(mod.reloadPlugins).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.reloadPlugins).not.toBe(void 0) })
  })
})
