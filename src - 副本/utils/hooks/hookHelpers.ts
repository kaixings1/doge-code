import { z } from 'zod/v4'
import type { Tool } from '../../Tool.js'
import {
  SYNTHETIC_OUTPUT_TOOL_NAME,
  SyntheticOutputTool,
} from '../../tools/SyntheticOutputTool/SyntheticOutputTool.js'
import { substituteArguments } from '../argumentSubstitution.js'
import { lazySchema } from '../lazySchema.js'
import type { SetAppState } from '../messageQueueManager.js'
import { hasSuccessfulToolCall } from '../messages.js'
import { addFunctionHook } from './sessionHooks.js'

/**
 * Schema for hook responses (shared by prompt and agent hooks)
 */
export const hookResponseSchema = lazySchema(() =>
  z.object({
    ok: z.boolean().describe('条件是否满足'),
    reason: z
      .string()
      .describe('条件未满足的原因')
      .optional(),
  }),
)

/**
 * Add hook input JSON to prompt, either replacing $ARGUMENTS placeholder or appending.
 * Also supports indexed arguments like $ARGUMENTS[0], $ARGUMENTS[1], or shorthand $0, $1, etc.
 */
export function addArgumentsToPrompt(
  prompt: string,
  jsonInput: string,
): string {
  return substituteArguments(prompt, jsonInput)
}

/**
 * Create a StructuredOutput tool configured for hook responses.
 * Reusable by agent hooks and background verification.
 */
export function createStructuredOutputTool(): Tool {
  return {
    ...SyntheticOutputTool,
    inputSchema: hookResponseSchema(),
    inputJSONSchema: {
      type: 'object',
      properties: {
        ok: {
          type: 'boolean',
          description: '条件是否满足',
        },
        reason: {
          type: 'string',
          description: '条件未满足的原因',
        },
      },
      required: ['ok'],
      additionalProperties: false,
    },
    async prompt(): Promise<string> {
      return `使用此工具返回你的验证结果。你必须在响应结束时恰好调用此工具一次。`
    },
  }
}

/**
 * Register a function hook that enforces structured output via SyntheticOutputTool.
 * Used by ask.tsx, execAgentHook.ts, and background verification.
 */
export function registerStructuredOutputEnforcement(
  setAppState: SetAppState,
  sessionId: string,
): void {
  addFunctionHook(
    setAppState,
    sessionId,
    'Stop',
    '', // No matcher - applies to all stops
    messages => hasSuccessfulToolCall(messages, SYNTHETIC_OUTPUT_TOOL_NAME),
    `你必须调用 ${SYNTHETIC_OUTPUT_TOOL_NAME} 工具来完成此请求。请立即调用此工具。`,
    { timeout: 5000 },
  )
}
