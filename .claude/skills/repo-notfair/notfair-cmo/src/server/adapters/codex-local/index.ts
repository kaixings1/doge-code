import type {
  HarnessAdapter,
  HarnessExecuteContext,
  HarnessEvent,
  AgentProvisionSpec,
  McpRegistrationSpec,
  McpUnregistrationSpec,
} from "../types";
import { executeCodexLocal } from "./execute";
import { provisionCodexAgent } from "./provision";
import { testCodexLocalEnvironment } from "./test";
import { registerCodexMcp, unregisterCodexMcp } from "./mcp";

export const codexLocalAdapter: HarnessAdapter = {
  id: "codex-local",
  testEnvironment: testCodexLocalEnvironment,
  execute(ctx: HarnessExecuteContext): AsyncGenerator<HarnessEvent, void, void> {
    return executeCodexLocal(ctx);
  },
  async provisionAgent(spec: AgentProvisionSpec): Promise<void> {
    await provisionCodexAgent(spec);
  },
  async registerMcp(spec: McpRegistrationSpec): Promise<void> {
    await registerCodexMcp(spec);
  },
  async unregisterMcp(spec: McpUnregistrationSpec): Promise<void> {
    await unregisterCodexMcp(spec.serverName, spec.projectSlug);
  },
};
