import { describe, it, expect } from 'vitest'
import {
  getModelCapability,
  resolveModelForCapability,
  canModelHandleTask,
  type TaskCapability,
} from '../../utils/model/modelRouter.ts'

describe('modelRouter', () => {
  describe('getModelCapability', () => {
    it('should classify Opus models as expert', () => {
      expect(getModelCapability('claude-opus-4-6')).toBe('expert')
      expect(getModelCapability('claude-opus-4-5')).toBe('expert')
      expect(getModelCapability('claude-opus-4-0')).toBe('expert')
    })

    it('should classify Sonnet models as advanced', () => {
      expect(getModelCapability('claude-sonnet-4-6')).toBe('advanced')
      expect(getModelCapability('claude-sonnet-4-5')).toBe('advanced')
    })

    it('should classify Haiku models as standard', () => {
      expect(getModelCapability('claude-haiku-4-5')).toBe('standard')
      expect(getModelCapability('claude-haiku-3-5')).toBe('standard')
    })

    it('should classify GPT models correctly', () => {
      expect(getModelCapability('gpt-4o')).toBe('advanced')
      expect(getModelCapability('gpt-4-turbo')).toBe('advanced')
      expect(getModelCapability('o1')).toBe('expert')
      expect(getModelCapability('o3')).toBe('expert')
      expect(getModelCapability('gpt-3.5-turbo')).toBe('standard')
    })

    it('should classify Gemini models correctly', () => {
      expect(getModelCapability('gemini-2-5-pro')).toBe('advanced')
      expect(getModelCapability('gemini-2-5-flash')).toBe('standard')
    })

    it('should classify DeepSeek models correctly', () => {
      expect(getModelCapability('deepseek-reasoner')).toBe('expert')
      expect(getModelCapability('deepseek-chat')).toBe('standard')
    })

    it('should default unknown models to standard', () => {
      expect(getModelCapability('unknown-model')).toBe('standard')
      expect(getModelCapability('some-custom-model')).toBe('standard')
    })
  })

  describe('canModelHandleTask', () => {
    it('should return true when model capability >= required', () => {
      expect(canModelHandleTask('claude-opus-4-6', 'advanced')).toBe(true)
      expect(canModelHandleTask('claude-sonnet-4-6', 'standard')).toBe(true)
      expect(canModelHandleTask('gpt-4o', 'advanced')).toBe(true)
    })

    it('should return false when model capability < required', () => {
      expect(canModelHandleTask('claude-haiku-4-5', 'expert')).toBe(false)
      expect(canModelHandleTask('gpt-3.5-turbo', 'advanced')).toBe(false)
      expect(canModelHandleTask('qwen-turbo', 'standard')).toBe(false)
    })

    it('should return true when capabilities are equal', () => {
      expect(canModelHandleTask('claude-sonnet-4-6', 'advanced')).toBe(true)
      expect(canModelHandleTask('deepseek-reasoner', 'expert')).toBe(true)
    })
  })

  describe('resolveModelForCapability', () => {
    it('should return null when current model meets requirement', () => {
      expect(resolveModelForCapability('advanced', 'claude-sonnet-4-6')).toBeNull()
      expect(resolveModelForCapability('expert', 'claude-opus-4-6')).toBeNull()
      expect(resolveModelForCapability('standard', 'claude-haiku-4-5')).toBeNull()
    })

    it('should upgrade model when current is insufficient', () => {
      // Haiku (standard) cannot handle expert tasks
      const result = resolveModelForCapability('expert', 'claude-haiku-4-5')
      expect(result).not.toBeNull()
      expect(result).toMatch(/claude-opus|claude-sonnet|gpt-4|o1|o3|gemini-2-5-pro/)
    })

    it('should upgrade from standard to advanced', () => {
      const result = resolveModelForCapability('advanced', 'gpt-3.5-turbo')
      expect(result).not.toBeNull()
      expect(result).toMatch(/gpt-4|o1|o3|gemini-2-5-pro|claude-sonnet|claude-opus/)
    })
  })
})
