import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const agentExistsMock = vi.fn<(name: string) => Promise<boolean>>();
vi.mock("@/server/agent-templates", () => ({
  agentExists: (name: string) => agentExistsMock(name),
}));

import {
  __resetProvisioningForTesting,
  awaitProvisioning,
  clearProvisioning,
  startProvisioning,
  type ProvisionResult,
} from "./provisioning-state";

const okResult: ProvisionResult = {
  created: ["acme-cmo", "acme-google-ads"],
  existed: [],
  failed: [],
};

describe("provisioning-state", () => {
  beforeEach(() => {
    __resetProvisioningForTesting();
    agentExistsMock.mockReset();
  });

  afterEach(() => {
    __resetProvisioningForTesting();
  });

  describe("happy path (Promise present)", () => {
    it("resolves to ready with the provisioning result", async () => {
      const promise = Promise.resolve(okResult);
      startProvisioning("acme", promise);
      const r = await awaitProvisioning("acme", 5_000);
      expect(r).toEqual({ kind: "ready", via_fallback: false, result: okResult });
    });

    it("consumes the map entry after resolution", async () => {
      startProvisioning("acme", Promise.resolve(okResult));
      await awaitProvisioning("acme", 5_000);
      // Second call should hit the cold-start path now.
      agentExistsMock.mockResolvedValue(true);
      const r2 = await awaitProvisioning("acme", 5_000);
      expect(r2).toEqual({ kind: "ready", via_fallback: true });
    });
  });

  describe("timeout", () => {
    it("returns timeout when Promise doesn't resolve in time", async () => {
      const slowPromise = new Promise<ProvisionResult>((resolve) =>
        setTimeout(() => resolve(okResult), 200),
      );
      startProvisioning("acme", slowPromise);
      const r = await awaitProvisioning("acme", 50);
      expect(r).toEqual({ kind: "timeout" });
    });
  });

  describe("Promise rejection", () => {
    it("returns timeout when the provisioning Promise rejects", async () => {
      const rejected = Promise.reject(new Error("openclaw blew up"));
      // Pre-catch to avoid Node's unhandled-rejection warning in the test runner.
      rejected.catch(() => {});
      startProvisioning("acme", rejected);
      const r = await awaitProvisioning("acme", 5_000);
      expect(r).toEqual({ kind: "timeout" });
    });
  });

  describe("clearProvisioning (called from deleteProjectAction)", () => {
    it("drops an in-flight Promise so a re-created slug starts fresh", async () => {
      const slowPromise = new Promise<ProvisionResult>((resolve) =>
        setTimeout(() => resolve(okResult), 1_000),
      );
      startProvisioning("acme", slowPromise);
      clearProvisioning("acme");
      // After clear, the Map is empty for this slug → next awaitProvisioning
      // hits the cold-start fallback path.
      agentExistsMock.mockResolvedValue(false);
      const r = await awaitProvisioning("acme", 5_000);
      expect(r).toEqual({ kind: "no-agents", via_fallback: true });
    });

    it("is a no-op when slug isn't in the Map (deleteProjectAction can call defensively)", () => {
      expect(() => clearProvisioning("never-seen")).not.toThrow();
    });
  });

  describe("cold-start fallback (Map empty)", () => {
    it("returns ready when both expected agents exist on disk", async () => {
      agentExistsMock.mockImplementation(async (name) =>
        name === "acme-cmo" || name === "acme-google-ads",
      );
      const r = await awaitProvisioning("acme", 5_000);
      expect(r).toEqual({ kind: "ready", via_fallback: true });
      expect(agentExistsMock).toHaveBeenCalledWith("acme-cmo");
      expect(agentExistsMock).toHaveBeenCalledWith("acme-google-ads");
    });

    it("returns no-agents when neither agent exists", async () => {
      agentExistsMock.mockResolvedValue(false);
      const r = await awaitProvisioning("acme", 5_000);
      expect(r).toEqual({ kind: "no-agents", via_fallback: true });
    });

    it("returns no-agents when only one of the expected agents exists", async () => {
      agentExistsMock.mockImplementation(async (name) => name === "acme-cmo");
      const r = await awaitProvisioning("acme", 5_000);
      expect(r).toEqual({ kind: "no-agents", via_fallback: true });
    });
  });
});
