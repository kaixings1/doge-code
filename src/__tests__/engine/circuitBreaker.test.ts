/**
 * engine/errors/circuitBreaker.test.ts — CircuitBreaker 单元测试
 */

import { describe, it, expect, beforeEach } from "vitest"
import { CircuitBreaker } from "../../engine/errors/circuitBreaker.ts"

describe("CircuitBreaker", () => {
  let cb: CircuitBreaker

  beforeEach(() => {
    cb = new CircuitBreaker({
      windowMs: 60000,
      threshold: 5,
      cooldownMs: 30000,
      errorRateThreshold: 0.5,
      minRequests: 3,
    })
  })

  describe("initial state", () => {
    it("should allow first call (cold start)", () => {
      const result = cb.check("bash")
      expect(result.allowed).toBe(true)
      expect(result.state.status).toBe("closed")
      expect(result.state.consecutiveFailures).toBe(0)
    })
  })

  describe("closed state", () => {
    it("should trip when error rate exceeds threshold", () => {
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      // 3 requests, 3 failures = 100% > 50%
      const result = cb.check("bash")
      expect(result.allowed).toBe(false)
      expect(result.state.status).toBe("open")
    })

    it("should not trip below minRequests (cold start protection)", () => {
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      // only 2 requests, minRequests = 3
      const result = cb.check("bash")
      expect(result.allowed).toBe(true)
      expect(result.state.status).toBe("closed")
    })
  })

  describe("open state", () => {
    it("should block calls during cooldown", () => {
      // Trip the breaker first
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      cb.check("bash") // trips to open

      const result = cb.check("bash")
      expect(result.allowed).toBe(false)
      expect(result.state.status).toBe("open")
      expect(result.reason).toContain("冷却中")
    })

    it("should transition to half-open after cooldown", () => {
      // Trip the breaker
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      cb.check("bash") // trips to open

      // Advance past cooldown
      const records = (cb as unknown as { records: Map<string, { openedAt: number }> }).records
      const state = records.get("bash")!
      state.openedAt = Date.now() - 31000

      const result = cb.check("bash")
      expect(result.allowed).toBe(true)
      expect(result.state.status).toBe("half-open")
    })
  })

  describe("half-open state", () => {
    it("should close after success", () => {
      // Trip and advance to half-open
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      cb.check("bash") // trips
      const records = (cb as unknown as { records: Map<string, { openedAt: number }> }).records
      const state = records.get("bash")!
      state.openedAt = Date.now() - 31000
      cb.check("bash") // half-open

      cb.recordSuccess("bash")
      const result = cb.check("bash")
      expect(result.allowed).toBe(true)
      expect(result.state.status).toBe("closed")
    })

    it("should reopen after failure in half-open", () => {
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      cb.check("bash") // trips
      const records = (cb as unknown as { records: Map<string, { openedAt: number }> }).records
      const state = records.get("bash")!
      state.openedAt = Date.now() - 31000
      cb.check("bash") // half-open

      cb.recordFailure("bash")
      const result = cb.check("bash")
      expect(result.allowed).toBe(false)
      expect(result.state.status).toBe("open")
    })
  })

  describe("reset", () => {
    it("should reset single entity", () => {
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      cb.check("bash") // trips
      cb.reset("bash")
      const result = cb.check("bash")
      expect(result.allowed).toBe(true)
      expect(result.state.status).toBe("closed")
      expect(result.state.consecutiveFailures).toBe(0)
    })

    it("should reset all entities", () => {
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      cb.recordFailure("read")
      cb.recordFailure("read")
      cb.check("bash") // trips
      cb.check("read") // trips (3 failures out of 3 = 100%)
      cb.resetAll()

      expect(cb.getState("bash").status).toBe("closed")
      expect(cb.getState("bash").consecutiveFailures).toBe(0)
      expect(cb.getState("read").status).toBe("closed")
      expect(cb.getState("read").consecutiveFailures).toBe(0)
    })
  })

  describe("independent entities", () => {
    it("should track each key independently", () => {
      // bash: 3 failures = 100% error rate → trips
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      // read: 2 failures = below minRequests → stays closed
      cb.recordFailure("read")
      cb.recordFailure("read")

      const bashResult = cb.check("bash")
      const readResult = cb.check("read")

      expect(bashResult.allowed).toBe(false)
      expect(bashResult.state.status).toBe("open")
      expect(readResult.allowed).toBe(true)
      expect(readResult.state.status).toBe("closed")
    })
  })

  describe("listAll", () => {
    it("should return all tracked entities", () => {
      cb.check("bash") // initialize
      cb.recordFailure("bash")
      cb.check("read") // initialize
      cb.recordFailure("read")
      const all = cb.listAll()
      expect(all.size).toBe(2)
    })
  })

  describe("recovery via success", () => {
    it("should reset consecutive failures on success", () => {
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      cb.recordFailure("bash")
      expect(cb.getState("bash").consecutiveFailures).toBe(3)

      cb.recordSuccess("bash")
      expect(cb.getState("bash").consecutiveFailures).toBe(0)
    })
  })
})
