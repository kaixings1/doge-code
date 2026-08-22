import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/diagram/index'

describe('diagram', () => {
  describe('diagramCommand', () => {
      it('should be defined', () => { expect(mod.diagramCommand).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.diagramCommand).not.toBe(void 0) })
  })
})
