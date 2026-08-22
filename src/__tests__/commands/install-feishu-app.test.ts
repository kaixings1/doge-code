import { describe, it, expect, vi } from 'vitest'
import * as mod from './../../commands/install-feishu-app/index'

describe('install-feishu-app', () => {
  describe('installFeishuApp', () => {
      it('should be defined', () => { expect(mod.installFeishuApp).toBeDefined() })
      it('should be a const', () => { expect(typeof mod.installFeishuApp).not.toBe(void 0) })
  })
})
