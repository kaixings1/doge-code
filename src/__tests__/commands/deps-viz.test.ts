import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/deps-viz/index'

describe('deps-viz', () => {
  describe('depsViz', () => {
      it('should be defined', () => { expect(mod.depsViz).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.depsViz).not.toBe(void 0) })
  })
})
