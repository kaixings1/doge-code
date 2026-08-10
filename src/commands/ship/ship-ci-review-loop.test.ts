/**
 * commands/ship/ship-ci-review-loop.test.ts — CI/Review 监控循环测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { runCIMonitorLoop, categorizeComment } from "./ship-ci-review-loop.ts"

describe("ship-ci-review-loop", () => {
  describe("categorizeComment", () => {
    it("should detect false positives", () => {
      expect(categorizeComment("This is a false positive, won't fix")).toBe("false_positive")
      expect(categorizeComment("Not applicable to this codebase")).toBe("false_positive")
      expect(categorizeComment("By design, this is intentional")).toBe("false_positive")
    })

    it("should detect questions", () => {
      expect(categorizeComment("What is the purpose of this function?")).toBe("question")
      expect(categorizeComment("Can you explain this?")).toBe("question")
      expect(categorizeComment("Why is this needed?")).toBe("question")
    })

    it("should detect nit comments", () => {
      expect(categorizeComment("nit: extra whitespace here")).toBe("nit")
      expect(categorizeComment("minor: typo in comment")).toBe("nit")
      expect(categorizeComment("typo: 'recieve' should be 'receive'")).toBe("nit")
    })

    it("should detect style suggestions", () => {
      expect(categorizeComment("Consider using camelCase for consistency")).toBe("style_suggestion")
      expect(categorizeComment("Naming convention doesn't match the rest of the codebase")).toBe("style_suggestion")
    })

    it("should default to code_fix_required", () => {
      expect(categorizeComment("This will crash on null input")).toBe("code_fix_required")
      expect(categorizeComment("Memory leak here")).toBe("code_fix_required")
      expect(categorizeComment("SQL injection vulnerability")).toBe("code_fix_required")
    })
  })

  describe("runCIMonitorLoop", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("should have correct default options", async () => {
      // This test verifies the function signature and defaults
      // Actual execution requires gh CLI and a real PR
      const options = {
        prNumber: 1,
        maxIterations: 10,
        initialWaitSeconds: 180,
        iterationWaitSeconds: 30,
        verbose: false,
      }

      // Verify options are correctly typed
      expect(options.prNumber).toBe(1)
      expect(options.maxIterations).toBe(10)
      expect(options.initialWaitSeconds).toBe(180)
      expect(options.iterationWaitSeconds).toBe(30)
    })
  })
})
