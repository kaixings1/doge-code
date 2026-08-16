import { homedir } from "node:os";
import { join } from "node:path";
import type {
  HarnessAdapter,
  HarnessExecuteContext,
  HarnessEvent,
  AgentProvisionSpec,
  McpRegistrationSpec,
  McpUnregistrationSpec,
} from "../types";
import { executeClaudeCodeLocal } from "./execute";
import { provisionClaudeCodeAgent } from "./provision";
import { testClaudeCodeLocalEnvironment } from "./test";
import { registerClaudeCodeMcp, unregisterClaudeCodeMcp } from "./mcp";

function dataDir(): string {
  return process.env.NOTFAIR_CMO_DATA_DIR ?? join(homedir(), ".notfair-cmo");
}

function workspaceDirFor(agentId: string): string {
  return join(dataDir(), "agents", agentId);
}

export const claudeCodeLocalAdapter: HarnessAdapter = {
  id: "claude-code-local",
  testEnvironment: testClaudeCodeLocalEnvironment,
  execute(ctx: HarnessExecuteContext): AsyncGenerator<HarnessEvent, void, void> {
    return executeClaudeCodeLocal(ctx);
  },
  async provisionAgent(spec: AgentProvisionSpec): Promise<void> {
    await provisionClaudeCodeAgent(spec);
  },
  async registerMcp(spec: McpRegistrationSpec): Promise<void> {
    await registerClaudeCodeMcp(workspaceDirFor(spec.agentId), spec);
  },
  async unregisterMcp(spec: McpUnregistrationSpec): Promise<void> {
    await unregisterClaudeCodeMcp(workspaceDirFor(spec.agentId), spec.serverName);
  },
};
