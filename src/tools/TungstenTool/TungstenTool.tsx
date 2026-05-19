import { z } from 'zod/v4'
import type { Tool } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const NAME = 'Tungsten'
const DISABLED_REASON =
  'Tungsten is unavailable in this source scaffold.'

const inputSchema = lazySchema(() => z.strictObject({}))
type InputSchema = ReturnType<typeof inputSchema>

export const TungstenTool: Tool<InputSchema, string> = buildTool({
  name: NAME,
  maxResultSizeChars: 4_096,
  async description() {
    return DISABLED_REASON
  },
  async prompt() {
    return DISABLED_REASON
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  userFacingName() {
    return NAME
  },
  isEnabled() {
    return false
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  async checkPermissions() {
    return { behavior: 'allow' as const }
  },
  renderToolUseMessage() {
    return null
  },
  renderToolUseProgressMessage() {
    return null
  },
  renderToolUseQueuedMessage() {
    return null
  },
  renderToolUseRejectedMessage() {
    return null
  },
  renderToolResultMessage() {
    return null
  },
  renderToolUseErrorMessage() {
    return null
  },
  async call() {
    throw new Error(DISABLED_REASON)
  },
  mapToolResultToToolResultBlockParam(result, toolUseID) {
    return {
      type: 'tool_result',
      content: String(result),
      tool_use_id: toolUseID,
    }
  },
} satisfies ToolDef<InputSchema, string>)

export function clearSessionsWithTungstenUsage(): void {}
export function resetInitializationState(): void {}
