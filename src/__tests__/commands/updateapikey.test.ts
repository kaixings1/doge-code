import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/updateapikey/index'

describe('updateapikey', () => {
  describe('updateApiKey', () => {
      it('should be defined', () => { expect(mod.updateApiKey).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.updateApiKey).not.toBe(void 0) })
  })
})
