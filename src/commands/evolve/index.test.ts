/**
 * commands/evolve/index.test.ts — 直觉进化系统测试
 */

import { describe, it, expect } from "vitest"
import { evolve } from "./index.ts"

describe("evolve command", () => {
  describe("help output", () => {
    it("should show help for --help", async () => {
      const result = await evolve.load()
      const output = await result.call('--help', {} as any)

      expect(output.type).toBe('text')
      expect(output.value).toContain('🧬 直觉进化')
      expect(output.value).toContain('/evolve')
      expect(output.value).toContain('--quick')
      expect(output.value).toContain('--deep')
      expect(output.value).toContain('--generate')
    })
  })

  describe("evolution analysis (standard mode)", () => {
    it("should return analysis with correct structure", async () => {
      const result = await evolve.load()
      const output = await result.call('', {} as any)

      expect(output.type).toBe('text')
      expect(output.value).toContain('🧬 直觉进化分析')
      expect(output.value).toContain('分析了')
      expect(output.value).toContain('个命令')
      expect(output.value).toContain('🔍 发现')
      expect(output.value).toContain('个进化候选')
    })

    it("should detect command candidates from category clustering", async () => {
      const result = await evolve.load()
      const output = await result.call('', {} as any)

      expect(output.value).toContain('📟 命令候选')
      // Baseline has 48 commands across multiple categories
      // Should find at least deployment cluster (ship, review, commit-push-pr, deploy, rollback)
      expect(output.value).toContain('deployment')
    })

    it("should detect skill candidates from workflow gaps", async () => {
      const result = await evolve.load()
      const output = await result.call('', {} as any)

      expect(output.value).toContain('⚡ 技能候选')
      // cost + performance should trigger skill candidate
      expect(output.value).toContain('cost-performance')
    })

    it("should show confidence levels with icons", async () => {
      const result = await evolve.load()
      const output = await result.call('', {} as any)

      expect(output.value).toContain('🟢')
      expect(output.value).toContain('%')
    })

    it("should provide evolution suggestions", async () => {
      const result = await evolve.load()
      const output = await result.call('', {} as any)

      expect(output.value).toContain('💡 进化建议')
    })
  })

  describe("depth modes", () => {
    it("should handle --quick mode", async () => {
      const result = await evolve.load()
      const output = await result.call('--quick', {} as any)

      expect(output.type).toBe('text')
      expect(output.value).toContain('🧬 直觉进化分析')
    })

    it("should handle --deep mode", async () => {
      const result = await evolve.load()
      const output = await result.call('--deep', {} as any)

      expect(output.type).toBe('text')
      expect(output.value).toContain('🧬 直觉进化分析')
    })

    it("should handle --generate mode", async () => {
      const result = await evolve.load()
      const output = await result.call('--generate', {} as any)

      expect(output.type).toBe('text')
      expect(output.value).toContain('📁 生成的进化文件')
      expect(output.value).toContain('⚠️')
    })
  })

  describe("category detection", () => {
    it("should categorize deployment commands", async () => {
      // Test via the actual output which includes categorized results
      const result = await evolve.load()
      const output = await result.call('', {} as any)

      expect(output.value).toContain('deployment')
    })

    it("should categorize testing commands", async () => {
      const result = await evolve.load()
      const output = await result.call('', {} as any)

      expect(output.value).toContain('testing')
    })

    it("should categorize automation commands", async () => {
      const result = await evolve.load()
      const output = await result.call('', {} as any)

      expect(output.value).toContain('automation')
    })
  })
})
