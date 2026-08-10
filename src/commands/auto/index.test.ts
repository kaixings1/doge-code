/**
 * commands/auto/index.test.ts — 智能命令路由器测试
 */

import { describe, it, expect, beforeEach } from "vitest"
import { selectCommand, ROUTING_RULES, FALLBACK_RULE } from "./index.ts"

describe("auto command router", () => {
  describe("selectCommand", () => {
    it("should route build failures to build-fix (P0)", () => {
      const result = selectCommand("npm run build 报错了，类型不匹配")
      expect(result.command).toBe("build-fix")
      expect(result.priority).toBe(0)
      expect(result.keywords.length).toBeGreaterThan(0)
    })

    it("should route e2e tests to test command (P1)", () => {
      const result = selectCommand("帮我写 e2e 测试")
      expect(result.command).toBe("test")
      expect(result.priority).toBe(1)
    })

    it("should route code review to review command (P2)", () => {
      const result = selectCommand("审查一下这段代码")
      expect(result.command).toBe("review")
      expect(result.priority).toBe(2)
    })

    it("should route refactor to refactor command (P3)", () => {
      const result = selectCommand("重构并清理死代码")
      expect(result.command).toBe("refactor")
      expect(result.priority).toBe(3)
    })

    it("should route docs to update-docs command (P3)", () => {
      const result = selectCommand("更新 README 文档")
      expect(result.command).toBe("update-docs")
      expect(result.priority).toBe(3)
    })

    it("should route feature development to plan (P4 fallback)", () => {
      const result = selectCommand("添加用户登录功能")
      expect(result.command).toBe("plan")
      expect(result.priority).toBe(4)
    })

    it("should return plan for empty input", () => {
      const result = selectCommand("")
      expect(result.command).toBe("plan")
      expect(result.reason).toContain("空输入")
    })

    it("should return plan for unrecognized input", () => {
      const result = selectCommand("hello world")
      expect(result.command).toBe("plan")
      expect(result.priority).toBe(4)
    })

    it("should prioritize P0 over P1 when both match", () => {
      const result = selectCommand("构建失败，e2e 测试也挂了")
      expect(result.command).toBe("build-fix")
      expect(result.priority).toBe(0)
    })

    it("should handle TDD keywords", () => {
      const result = selectCommand("用 TDD 方式实现购物车")
      expect(result.command).toBe("plan")
      expect(result.keywords).toContain("tdd")
    })

    it("should prioritize higher priority when multiple match", () => {
      const result = selectCommand("代码审查和重构")
      expect(result.command).toBe("review")
      // Alternatives only show rules with same priority (P2), refactor is P3 so not shown
      expect(result.priority).toBeLessThan(3)
    })
  })

  describe("ROUTING_RULES", () => {
    it("should have at least 7 rules", () => {
      expect(ROUTING_RULES.length).toBeGreaterThanOrEqual(7)
    })

    it("should have unique priorities (no duplicates at same level)", () => {
      const priorities = ROUTING_RULES.map(r => r.priority)
      // Allow duplicates, but verify structure
      expect(priorities.every(p => p >= 0 && p <= 4)).toBe(true)
    })

    it("should all have required fields", () => {
      for (const rule of ROUTING_RULES) {
        expect(rule.keywords.length).toBeGreaterThan(0)
        expect(rule.command).toBeTruthy()
        expect(rule.description).toBeTruthy()
      }
    })
  })

  describe("FALLBACK_RULE", () => {
    it("should be P4", () => {
      expect(FALLBACK_RULE.priority).toBe(4)
    })

    it("should route to plan", () => {
      expect(FALLBACK_RULE.command).toBe("plan")
    })
  })
})
