import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/thinkback/index'

describe('thinkback', () => {
  describe('thinkback', () => {
      it('should be defined', () => { expect(mod.thinkback).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.thinkback).not.toBe(void 0) })
  })
})
