/**
 * Tool Search utilities for dynamically discovering deferred tools.
 *
 * When enabled, deferred tools (MCP and shouldDefer tools) are sent with
 * defer_loading: true and discovered via ToolSearchTool rather than being
 * loaded upfront.
 */

import { memoize, uniqBy } from '../vendor/lodash.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import type { Tool } from '../Tool.js'
import {
  type ToolPermissionContext,
  type Tools,
  toolMatchesName,
} from '../Tool.js'
import type { Command } from '../types/command.js'
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import {
  formatDeferredToolLine,
  isDeferredTool,
  TOOL_SEARCH_TOOL_NAME,
} from '../tools/ToolSearchTool/prompt.js'
import type { Message } from '../types/message.js'
import {
  countToolDefinitionTokens,
  TOOL_TOKEN_COUNT_OVERHEAD,
} from './analyzeContext.js'
import { count } from './array.js'
import { getMergedBetas } from './betas.js'
import { getContextWindowForModel } from './context.js'
import { logForDebugging } from './debug.js'
import { isEnvDefinedFalsy, isEnvTruthy } from './envUtils.js'
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl,
} from './model/providers.js'
import { jsonStringify } from './slowOperations.js'
import { zodToJsonSchema } from './zodToJsonSchema.js'

/**
 * Default percentage of context window at which to auto-enable tool search.
 * When MCP tool descriptions exceed this percentage (in tokens), tool search is enabled.
 * Can be overridden via ENABLE_TOOL_SEARCH=auto:N where N is 0-100.
 */
const DEFAULT_AUTO_TOOL_SEARCH_PERCENTAGE = 10 // 10%

/**
 * Parse auto:N syntax from ENABLE_TOOL_SEARCH env var.
 * Returns the percentage clamped to 0-100, or null if not auto:N format or not a number.
 */
function parseAutoPercentage(value: string): number | null {
  if (!value.startsWith('auto:')) return null

  const percentStr = value.slice(5)
  const percent = parseInt(percentStr, 10)

  if (isNaN(percent)) {
    logForDebugging(
      `Invalid ENABLE_TOOL_SEARCH value "${value}": expected auto:N where N is a number.`,
    )
    return null
  }

  // Clamp to valid range
  return Math.max(0, Math.min(100, percent))
}

/**
 * Check if ENABLE_TOOL_SEARCH is set to auto mode (auto or auto:N).
 */
function isAutoToolSearchMode(value: string | undefined): boolean {
  if (!value) return false
  return value === 'auto' || value.startsWith('auto:')
}

/**
 * Get the auto-enable percentage from env var or default.
 */
function getAutoToolSearchPercentage(): number {
  const value = process.env.ENABLE_TOOL_SEARCH
  if (!value) return DEFAULT_AUTO_TOOL_SEARCH_PERCENTAGE

  if (value === 'auto') return DEFAULT_AUTO_TOOL_SEARCH_PERCENTAGE

  const parsed = parseAutoPercentage(value)
  if (parsed !== null) return parsed

  return DEFAULT_AUTO_TOOL_SEARCH_PERCENTAGE
}

/**
 * Approximate chars per token for MCP tool definitions (name + description + input schema).
 * Used as fallback when the token counting API is unavailable.
 */
const CHARS_PER_TOKEN = 2.5

/**
 * Get the token threshold for auto-enabling tool search for a given model.
 */
function getAutoToolSearchTokenThreshold(model: string): number {
  const betas = getMergedBetas(model)
  const contextWindow = getContextWindowForModel(model, betas)
  const percentage = getAutoToolSearchPercentage() / 100
  return Math.floor(contextWindow * percentage)
}

/**
 * Get the character threshold for auto-enabling tool search for a given model.
 * Used as fallback when the token counting API is unavailable.
 */
export function getAutoToolSearchCharThreshold(model: string): number {
  return Math.floor(getAutoToolSearchTokenThreshold(model) * CHARS_PER_TOKEN)
}

/**
 * Get the total token count for all deferred tools using the token counting API.
 * Memoized by deferred tool names — cache is invalidated when MCP servers connect/disconnect.
 * Returns null if the API is unavailable (caller should fall back to char heuristic).
 */
const getDeferredToolTokenCount = memoize(
  async (
    tools: Tools,
    getToolPermissionContext: () => Promise<ToolPermissionContext>,
    agents: AgentDefinition[],
    model: string,
  ): Promise<number | null> => {
    const deferredTools = tools.filter(t => isDeferredTool(t))
    if (deferredTools.length === 0) return 0

    try {
      const total = await countToolDefinitionTokens(
        deferredTools,
        getToolPermissionContext,
        { activeAgents: agents, allAgents: agents },
        model,
      )
      if (total === 0) return null // API unavailable
      return Math.max(0, total - TOOL_TOKEN_COUNT_OVERHEAD)
    } catch {
      return null // Fall back to char heuristic
    }
  },
  (tools: Tools) =>
    tools
      .filter(t => isDeferredTool(t))
      .map(t => t.name)
      .join(','),
)

/**
 * Tool search mode. Determines how deferrable tools (MCP + shouldDefer) are
 * surfaced:
 *   - 'tst': Tool Search Tool — deferred tools discovered via ToolSearchTool (always enabled)
 *   - 'tst-auto': auto — tools deferred only when they exceed threshold
 *   - 'standard': tool search disabled — all tools exposed inline
 */
export type ToolSearchMode = 'tst' | 'tst-auto' | 'standard'

/**
 * Determines the tool search mode from ENABLE_TOOL_SEARCH.
 *
 *   ENABLE_TOOL_SEARCH    Mode
 *   auto / auto:1-99      tst-auto
 *   true / auto:0         tst
 *   false / auto:100      standard
 *   (unset)               tst (default: always defer MCP and shouldDefer tools)
 */
export function getToolSearchMode(): ToolSearchMode {
  // CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS is a kill switch for beta API
  // features. Tool search emits defer_loading on tool definitions and
  // tool_reference content blocks — both require the API to accept a beta
  // header. When the kill switch is set, force 'standard' so no beta shapes
  // reach the wire, even if ENABLE_TOOL_SEARCH is also set. This is the
  // explicit escape hatch for proxy gateways that the heuristic in
  // isToolSearchEnabledOptimistic doesn't cover.
  // github.com/anthropics/claude-code/issues/20031
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)) {
    return 'standard'
  }

  const value = process.env.ENABLE_TOOL_SEARCH

  // Handle auto:N syntax - check edge cases first
  const autoPercent = value ? parseAutoPercentage(value) : null
  if (autoPercent === 0) return 'tst' // auto:0 = always enabled
  if (autoPercent === 100) return 'standard'
  if (isAutoToolSearchMode(value)) {
    return 'tst-auto' // auto or auto:1-99
  }

  if (isEnvTruthy(value)) return 'tst'
  if (isEnvDefinedFalsy(process.env.ENABLE_TOOL_SEARCH)) return 'standard'
  return 'tst' // default: always defer MCP and shouldDefer tools
}

/**
 * Default patterns for models that do NOT support tool_reference.
 * New models are assumed to support tool_reference unless explicitly listed here.
 */
const DEFAULT_UNSUPPORTED_MODEL_PATTERNS = ['haiku']

/**
 * Get the list of model patterns that do NOT support tool_reference.
 * Can be configured via GrowthBook for live updates without code changes.
 */
function getUnsupportedToolReferencePatterns(): string[] {
  try {
    // Try to get from GrowthBook for live configuration
    const patterns = getFeatureValue_CACHED_MAY_BE_STALE<string[] | null>(
      'tengu_tool_search_unsupported_models',
      null,
    )
    if (patterns && Array.isArray(patterns) && patterns.length > 0) {
      return patterns
    }
  } catch {
    // GrowthBook not ready, use defaults
  }
  return DEFAULT_UNSUPPORTED_MODEL_PATTERNS
}

/**
 * Check if a model supports tool_reference blocks (required for tool search).
 *
 * This uses a negative test: models are assumed to support tool_reference
 * UNLESS they match a pattern in the unsupported list. This ensures new
 * models work by default without code changes.
 *
 * Currently, Haiku models do NOT support tool_reference. This can be
 * updated via GrowthBook feature 'tengu_tool_search_unsupported_models'.
 *
 * @param model The model name to check
 * @returns true if the model supports tool_reference, false otherwise
 */
export function modelSupportsToolReference(model: string): boolean {
  const normalizedModel = model.toLowerCase()
  const unsupportedPatterns = getUnsupportedToolReferencePatterns()

  // Check if model matches any unsupported pattern
  for (const pattern of unsupportedPatterns) {
    if (normalizedModel.includes(pattern.toLowerCase())) {
      return false
    }
  }

  // New models are assumed to support tool_reference
  return true
}

/**
 * Check if tool search *might* be enabled (optimistic check).
 *
 * Returns true if tool search could potentially be enabled, without checking
 * dynamic factors like model support or threshold. Use this for:
 * - Including ToolSearchTool in base tools (so it's available if needed)
 * - Preserving tool_reference fields in messages (can be stripped later)
 * - Checking if ToolSearchTool should report itself as enabled
 *
 * Returns false only when tool search is definitively disabled (standard mode).
 *
 * For the definitive check that includes model support and threshold,
 * use isToolSearchEnabled().
 */
let loggedOptimistic = false
let optimisticCache: { mode: ToolSearchMode; result: boolean } | null = null

export function isToolSearchEnabledOptimistic(): boolean {
  const mode = getToolSearchMode()
  if (optimisticCache?.mode === mode) {
    return optimisticCache.result
  }
  const result = computeIsToolSearchEnabledOptimistic(mode)
  optimisticCache = { mode, result }
  return result
}

function computeIsToolSearchEnabledOptimistic(mode: ToolSearchMode): boolean {
  if (mode === 'standard') {
    if (!loggedOptimistic) {
      loggedOptimistic = true
      logForDebugging(
        `[ToolSearch:optimistic] mode=${mode}, ENABLE_TOOL_SEARCH=${process.env.ENABLE_TOOL_SEARCH}, result=false`,
      )
    }
    return false
  }

  // tool_reference is a beta content type that third-party API gateways
  // (ANTHROPIC_BASE_URL proxies) typically don't support. When the provider
  // is 'firstParty' but the base URL points elsewhere, the proxy will reject
  // tool_reference blocks with a 400. Vertex/Bedrock/Foundry are unaffected —
  // they have their own endpoints and beta headers.
  // https://github.com/anthropics/claude-code/issues/30912
  //
  // HOWEVER: some proxies DO support tool_reference (LiteLLM passthrough,
  // Cloudflare AI Gateway, corp gateways that forward beta headers). The
  // blanket disable breaks defer_loading for those users — all MCP tools
  // loaded into main context instead of on-demand (gh-31936 / CC-457,
  // likely the real cause of CC-330 "v2.1.70 defer_loading regression").
  // This gate only applies when ENABLE_TOOL_SEARCH is unset/empty (default
  // behavior). Setting any non-empty value — 'true', 'auto', 'auto:N' —
  // means the user is explicitly configuring tool search and asserts their
  // setup supports it. The falsy check (rather than === undefined) aligns
  // with getToolSearchMode(), which also treats "" as unset.
  if (
    !process.env.ENABLE_TOOL_SEARCH &&
    getAPIProvider() === 'firstParty' &&
    !isFirstPartyAnthropicBaseUrl()
  ) {
    if (!loggedOptimistic) {
      loggedOptimistic = true
      logForDebugging(
        `[ToolSearch:optimistic] disabled: ANTHROPIC_BASE_URL=${process.env.ANTHROPIC_BASE_URL} is not a first-party Anthropic host. Set ENABLE_TOOL_SEARCH=true (or auto / auto:N) if your proxy forwards tool_reference blocks.`,
      )
    }
    return false
  }

  if (!loggedOptimistic) {
    loggedOptimistic = true
    logForDebugging(
      `[ToolSearch:optimistic] mode=${mode}, ENABLE_TOOL_SEARCH=${process.env.ENABLE_TOOL_SEARCH}, result=true`,
    )
  }
  return true
}

/**
 * Check if ToolSearchTool is available in the provided tools list.
 * If ToolSearchTool is not available (e.g., disallowed via disallowedTools),
 * tool search cannot function and should be disabled.
 *
 * @param tools Array of tools with a 'name' property
 * @returns true if ToolSearchTool is in the tools list, false otherwise
 */
export function isToolSearchToolAvailable(
  tools: readonly { name: string }[],
): boolean {
  return tools.some(tool => toolMatchesName(tool, TOOL_SEARCH_TOOL_NAME))
}

/**
 * Calculate total deferred tool description size in characters.
 * Includes name, description text, and input schema to match what's actually sent to the API.
 */
async function calculateDeferredToolDescriptionChars(
  tools: Tools,
  getToolPermissionContext: () => Promise<ToolPermissionContext>,
  agents: AgentDefinition[],
): Promise<number> {
  const deferredTools = tools.filter(t => isDeferredTool(t))
  if (deferredTools.length === 0) return 0

  const sizes = await Promise.all(
    deferredTools.map(async tool => {
      const description = await tool.prompt({
        getToolPermissionContext,
        tools,
        agents,
      })
      const inputSchema = tool.inputJSONSchema
        ? jsonStringify(tool.inputJSONSchema)
        : tool.inputSchema
          ? jsonStringify(zodToJsonSchema(tool.inputSchema))
          : ''
      return tool.name.length + description.length + inputSchema.length
    }),
  )

  return sizes.reduce((total, size) => total + size, 0)
}

/**
 * Check if tool search (MCP tool deferral with tool_reference) is enabled for a specific request.
 *
 * This is the definitive check that includes:
 * - MCP mode (Tst, TstAuto, McpCli, Standard)
 * - Model compatibility (haiku doesn't support tool_reference)
 * - ToolSearchTool availability (must be in tools list)
 * - Threshold check for TstAuto mode
 *
 * Use this when making actual API calls where all context is available.
 *
 * @param model The model to check for tool_reference support
 * @param tools Array of available tools (including MCP tools)
 * @param getToolPermissionContext Function to get tool permission context
 * @param agents Array of agent definitions
 * @param source Optional identifier for the caller (for debugging)
 * @returns true if tool search should be enabled for this request
 */
export async function isToolSearchEnabled(
  model: string,
  tools: Tools,
  getToolPermissionContext: () => Promise<ToolPermissionContext>,
  agents: AgentDefinition[],
  source?: string,
): Promise<boolean> {
  const mcpToolCount = count(tools, t => t.isMcp)

  // Helper to log the mode decision event
  function logModeDecision(
    enabled: boolean,
    mode: ToolSearchMode,
    reason: string,
    extraProps?: Record<string, number>,
  ): void {
    logEvent('tengu_tool_search_mode_decision', {
      enabled,
      mode: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      reason:
        reason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      // Log the actual model being checked, not the session's main model.
      // This is important for debugging subagent tool search decisions where
      // the subagent model (e.g., haiku) differs from the session model (e.g., opus).
      checkedModel:
        model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      mcpToolCount,
      userType: (process.env.USER_TYPE ??
        'external') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...extraProps,
    })
  }

  // Check if model supports tool_reference
  if (!modelSupportsToolReference(model)) {
    logForDebugging(
      `Tool search disabled for model '${model}': model does not support tool_reference blocks. ` +
        `This feature is only available on Claude Sonnet 4+, Opus 4+, and newer models.`,
    )
    logModeDecision(false, 'standard', 'model_unsupported')
    return false
  }

  // Check if ToolSearchTool is available (respects disallowedTools)
  if (!isToolSearchToolAvailable(tools)) {
    logForDebugging(
      `Tool search disabled: ToolSearchTool is not available (may have been disallowed via disallowedTools).`,
    )
    logModeDecision(false, 'standard', 'mcp_search_unavailable')
    return false
  }

  const mode = getToolSearchMode()

  switch (mode) {
    case 'tst':
      logModeDecision(true, mode, 'tst_enabled')
      return true

    case 'tst-auto': {
      const { enabled, debugDescription, metrics } = await checkAutoThreshold(
        tools,
        getToolPermissionContext,
        agents,
        model,
      )

      if (enabled) {
        logForDebugging(
          `Auto tool search enabled: ${debugDescription}` +
            (source ? ` [source: ${source}]` : ''),
        )
        logModeDecision(true, mode, 'auto_above_threshold', metrics)
        return true
      }

      logForDebugging(
        `Auto tool search disabled: ${debugDescription}` +
          (source ? ` [source: ${source}]` : ''),
      )
      logModeDecision(false, mode, 'auto_below_threshold', metrics)
      return false
    }

    case 'standard':
      logModeDecision(false, mode, 'standard_mode')
      return false
  }
}

/**
 * Check if an object is a tool_reference block.
 * tool_reference is a beta feature not in the SDK types, so we need runtime checks.
 */
export function isToolReferenceBlock(obj: unknown): boolean {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'type' in obj &&
    (obj as { type: unknown }).type === 'tool_reference'
  )
}

/**
 * Type guard for tool_reference block with tool_name.
 */
function isToolReferenceWithName(
  obj: unknown,
): obj is { type: 'tool_reference'; tool_name: string } {
  return (
    isToolReferenceBlock(obj) &&
    'tool_name' in (obj as object) &&
    typeof (obj as { tool_name: unknown }).tool_name === 'string'
  )
}

/**
 * Type representing a tool_result block with array content.
 * Used for extracting tool_reference blocks from ToolSearchTool results.
 */
type ToolResultBlock = {
  type: 'tool_result'
  content: unknown[]
}

/**
 * Type guard for tool_result blocks with array content.
 */
function isToolResultBlockWithContent(obj: unknown): obj is ToolResultBlock {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'type' in obj &&
    (obj as { type: unknown }).type === 'tool_result' &&
    'content' in obj &&
    Array.isArray((obj as { content: unknown }).content)
  )
}

/**
 * Extract tool names from tool_reference blocks in message history.
 *
 * When dynamic tool loading is enabled, MCP tools are not predeclared in the
 * tools array. Instead, they are discovered via ToolSearchTool which returns
 * tool_reference blocks. This function scans the message history to find all
 * tool names that have been referenced, so we can include only those tools
 * in subsequent API requests.
 *
 * This approach:
 * - Eliminates the need to predeclare all MCP tools upfront
 * - Removes limits on total quantity of MCP tools
 *
 * Compaction replaces tool_reference-bearing messages with a summary, so it
 * snapshots the discovered set onto compactMetadata.preCompactDiscoveredTools
 * on the boundary marker; this scan reads it back. Snip instead protects the
 * tool_reference-carrying messages from removal.
 *
 * @param messages Array of messages that may contain tool_result blocks with tool_reference content
 * @returns Set of tool names that have been discovered via tool_reference blocks
 */
export function extractDiscoveredToolNames(messages: Message[]): Set<string> {
  const discoveredTools = new Set<string>()
  let carriedFromBoundary = 0

  for (const msg of messages) {
    // Compact boundary carries the pre-compact discovered set. Inline type
    // check rather than isCompactBoundaryMessage — utils/messages.ts imports
    // from this file, so importing back would be circular.
    if (msg.type === 'system' && msg.subtype === 'compact_boundary') {
      const carried = msg.compactMetadata?.preCompactDiscoveredTools
      if (carried) {
        for (const name of carried) discoveredTools.add(name)
        carriedFromBoundary += carried.length
      }
      continue
    }

    // Only user messages contain tool_result blocks (responses to tool_use)
    if (msg.type !== 'user') continue

    const content = msg.message?.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      // tool_reference blocks only appear inside tool_result content, specifically
      // in results from ToolSearchTool. The API expands these references into full
      // tool definitions in the model's context.
      if (isToolResultBlockWithContent(block)) {
        for (const item of block.content) {
          if (isToolReferenceWithName(item)) {
            discoveredTools.add(item.tool_name)
          }
        }
      }
    }
  }

  if (discoveredTools.size > 0) {
    logForDebugging(
      `Dynamic tool loading: found ${discoveredTools.size} discovered tools in message history` +
        (carriedFromBoundary > 0
          ? ` (${carriedFromBoundary} carried from compact boundary)`
          : ''),
    )
  }

  return discoveredTools
}

export type DeferredToolsDelta = {
  addedNames: string[]
  /** Rendered lines for addedNames; the scan reconstructs from names. */
  addedLines: string[]
  removedNames: string[]
}

/**
 * Call-site discriminator for the tengu_deferred_tools_pool_change event.
 * The scan runs from several sites with different expected-prior semantics
 * (inc-4747):
 *   - attachments_main: main-thread getAttachments → prior=0 is a BUG on fire-2+
 *   - attachments_subagent: subagent getAttachments → prior=0 is EXPECTED
 *     (fresh conversation, initialMessages has no DTD)
 *   - compact_full: compact.ts passes [] → prior=0 is EXPECTED
 *   - compact_partial: compact.ts passes messagesToKeep → depends on what survived
 *   - reactive_compact: reactiveCompact.ts passes preservedMessages → same
 * Without this the 96%-prior=0 stat is dominated by EXPECTED buckets and
 * the real main-thread cross-turn bug (if any) is invisible in BQ.
 */
export type DeferredToolsDeltaScanContext = {
  callSite:
    | 'attachments_main'
    | 'attachments_subagent'
    | 'compact_full'
    | 'compact_partial'
    | 'reactive_compact'
  querySource?: string
}

/**
 * True → announce deferred tools via persisted delta attachments.
 * False → claude.ts keeps its per-call <available-deferred-tools>
 * header prepend (the attachment does not fire).
 */
export function isDeferredToolsDeltaEnabled(): boolean {
  return (
    process.env.USER_TYPE === 'ant' ||
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_glacier_2xr', false)
  )
}

/**
 * Diff the current deferred-tool pool against what's already been
 * announced in this conversation (reconstructed by scanning for prior
 * deferred_tools_delta attachments). Returns null if nothing changed.
 *
 * A name that was announced but has since stopped being deferred — yet
 * is still in the base pool — is NOT reported as removed. It's now
 * loaded directly, so telling the model "no longer available" would be
 * wrong.
 */
export function getDeferredToolsDelta(
  tools: Tools,
  messages: Message[],
  scanContext?: DeferredToolsDeltaScanContext,
): DeferredToolsDelta | null {
  const announced = new Set<string>()
  let attachmentCount = 0
  let dtdCount = 0
  const attachmentTypesSeen = new Set<string>()
  for (const msg of messages) {
    if (msg.type !== 'attachment') continue
    attachmentCount++
    attachmentTypesSeen.add(msg.attachment.type)
    if (msg.attachment.type !== 'deferred_tools_delta') continue
    dtdCount++
    for (const n of msg.attachment.addedNames) announced.add(n)
    for (const n of msg.attachment.removedNames) announced.delete(n)
  }

  const deferred: Tool[] = tools.filter(isDeferredTool)
  const deferredNames = new Set(deferred.map(t => t.name))
  const poolNames = new Set(tools.map(t => t.name))

  const added = deferred.filter(t => !announced.has(t.name))
  const removed: string[] = []
  for (const n of announced) {
    if (deferredNames.has(n)) continue
    if (!poolNames.has(n)) removed.push(n)
    // else: undeferred — silent
  }

  if (added.length === 0 && removed.length === 0) return null

  // Diagnostic for the inc-4747 scan-finds-nothing bug. Round-1 fields
  // (messagesLength/attachmentCount/dtdCount from #23167) showed 45.6% of
  // events have attachments-but-no-DTD, but those numbers are confounded:
  // subagent first-fires and compact-path scans have EXPECTED prior=0 and
  // dominate the stat. callSite/querySource/attachmentTypesSeen split the
  // buckets so the real main-thread cross-turn failure is isolable in BQ.
  logEvent('tengu_deferred_tools_pool_change', {
    addedCount: added.length,
    removedCount: removed.length,
    priorAnnouncedCount: announced.size,
    messagesLength: messages.length,
    attachmentCount,
    dtdCount,
    callSite: (scanContext?.callSite ??
      'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    querySource: (scanContext?.querySource ??
      'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    attachmentTypesSeen: [...attachmentTypesSeen]
      .sort()
      .join(',') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  return {
    addedNames: added.map(t => t.name).sort(),
    addedLines: added.map(formatDeferredToolLine).sort(),
    removedNames: removed.sort(),
  }
}

/**
 * Check whether deferred tools exceed the auto-threshold for enabling TST.
 * Tries exact token count first; falls back to character-based heuristic.
 */
async function checkAutoThreshold(
  tools: Tools,
  getToolPermissionContext: () => Promise<ToolPermissionContext>,
  agents: AgentDefinition[],
  model: string,
): Promise<{
  enabled: boolean
  debugDescription: string
  metrics: Record<string, number>
}> {
  // Try exact token count first (cached, one API call per toolset change)
  const deferredToolTokens = await getDeferredToolTokenCount(
    tools,
    getToolPermissionContext,
    agents,
    model,
  )

  if (deferredToolTokens !== null) {
    const threshold = getAutoToolSearchTokenThreshold(model)
    return {
      enabled: deferredToolTokens >= threshold,
      debugDescription:
        `${deferredToolTokens} tokens (threshold: ${threshold}, ` +
        `${getAutoToolSearchPercentage()}% of context)`,
      metrics: { deferredToolTokens, threshold },
    }
  }

  // Fallback: character-based heuristic when token API is unavailable
  const deferredToolDescriptionChars =
    await calculateDeferredToolDescriptionChars(
      tools,
      getToolPermissionContext,
      agents,
    )
  const charThreshold = getAutoToolSearchCharThreshold(model)
  return {
    enabled: deferredToolDescriptionChars >= charThreshold,
    debugDescription:
      `${deferredToolDescriptionChars} chars (threshold: ${charThreshold}, ` +
      `${getAutoToolSearchPercentage()}% of context) (char fallback)`,
    metrics: { deferredToolDescriptionChars, charThreshold },
  }
}

// === Message-based tool filtering ===
// These keyword sets map user message content to tool categories.
// When a simple conversation (e.g. "hi", "hello") is detected, only these
// "always-on" tools are sent to reduce token overhead.

/**
 * Tools that are always available even in minimal mode — these handle
 * universal conversations, questions, and task management.
 */
export const ALWAYS_ON_TOOLS = new Set([
  'AgentTool',
  'TodoWriteTool',
  'TaskCreateTool',
  'TaskGetTool',
  'TaskUpdateTool',
  'TaskListTool',
])

/**
 * Keyword → tool name mapping for intent-based tool dispatch.
 * When the user message contains these keywords, the corresponding tool
 * is included in the request even if the conversation is otherwise simple.
 */
// bilingual keyword → tool mapping (both English and Chinese)
const TOOL_KEYWORD_MAP: Array<{ keywords: string[]; toolNames: string[] }> = [
  { keywords: ['read', 'cat', 'head', 'tail', 'view', 'open', 'show', 'look at', 'file', '读取', '打开', '查看', '显示'], toolNames: ['FileReadTool'] },
  { keywords: ['edit', 'modify', 'change', 'update', 'replace', 'sed', 'awk', '修改', '编辑', '更改', '更新'], toolNames: ['FileEditTool', 'MultiFileEditTool'] },
  { keywords: ['write', 'create', 'make', 'new file', 'generate', 'output', 'save', 'dump', 'echo', '写入', '创建', '生成', '保存', '新建文件'], toolNames: ['FileWriteTool'] },
  { keywords: ['search', 'grep', 'find', 'rg', 'locate', 'lookup', '搜索', '查找', '定位', '检索'], toolNames: ['GrepTool'] },
  { keywords: ['glob', 'wildcard', 'pattern', 'list', 'ls', 'tree', 'directory', 'folder', '通配符', '目录', '文件夹', '列出'], toolNames: ['GlobTool'] },
  { keywords: ['bash', 'shell', 'run', 'exec', 'command', 'terminal', 'cmd', 'ps1', 'pwsh', 'python', 'node', 'npm', 'yarn', 'pnpm', 'bun', 'cargo', 'go ', 'make', 'rake', 'docker', '执行', '运行', '终端', '命令', '脚本'], toolNames: ['BashTool', 'ShellTool'] },
  { keywords: ['web', 'fetch', 'download', 'curl', 'wget', 'url', 'scrape', 'website', '网页', '下载', '抓取', '网站'], toolNames: ['WebFetchTool'] },
  { keywords: ['search', 'google', 'bing', 'web search', 'lookup', '网络搜索', '谷歌', '百度'], toolNames: ['WebSearchTool', 'MultiSearchTool'] },
  { keywords: ['git', 'branch', 'commit', 'push', 'pull', 'merge', 'checkout', 'reset', 'stash', 'diff', '分支', '提交', '合并', '拉取', '推送'], toolNames: ['BashTool'] },
  { keywords: ['advisor', 'analyze', 'review', 'inspect', 'debug', '分析', '审查', '调试', '检查', '评估'], toolNames: ['AdvisorTool'] },
  { keywords: ['http', 'api', 'request', 'curl', 'post', 'get ', 'put ', 'fetch', '接口', '请求', '调用'], toolNames: ['HttpTool'] },
  { keywords: ['database', 'db', 'sql', 'postgres', 'mysql', 'sqlite', 'query', '数据库', '查询'], toolNames: ['DatabaseTool'] },
  { keywords: ['graphql', 'gql'], toolNames: ['GraphqlTool'] },
  { keywords: ['task', 'todo', 'todoist', 'remind', '任务', '待办', '提醒'], toolNames: ['TaskCreateTool', 'TodoWriteTool'] },
  { keywords: ['branch', 'switch', '分支', '切换'], toolNames: ['BranchTool'] },
  { keywords: ['compare', 'diff', '比较', '对比', '差异'], toolNames: ['CompareTool'] },
  { keywords: ['notebook', 'jupyter', '笔记本', 'jupyter'], toolNames: ['NotebookEditTool'] },
  { keywords: ['event', 'stream', '事件', '流'], toolNames: ['EventStreamTool'] },
  { keywords: ['queue', '队列'], toolNames: ['QueueTool'] },
  { keywords: ['cache', '缓存'], toolNames: ['CacheTool'] },
  { keywords: ['log', 'logging', '日志'], toolNames: ['LoggerTool'] },
  { keywords: ['monitor', '监控'], toolNames: ['MonitorTool'] },
  { keywords: ['metric', '指标'], toolNames: ['MetricsTool'] },
  { keywords: ['backup', '备份'], toolNames: ['BackupTool'] },
  { keywords: ['schedule', 'cron', 'timer', '定时', '计划'], toolNames: ['ScheduleTool', 'CronTool'] },
  { keywords: ['websocket', 'ws', '网络套接字'], toolNames: ['WebSocketTool'] },
  { keywords: ['context collapse', 'summarize', '上下文压缩', '总结', '压缩'], toolNames: ['ContextCollapseTool'] },
  { keywords: ['vim', 'visual', '可视化模式'], toolNames: ['VimVisualModeTool'] },
  { keywords: ['theme', '主题', '配色'], toolNames: ['ThemeTool'] },
  { keywords: ['effort', '努力度'], toolNames: ['EffortTool'] },
  { keywords: ['brief', '摘要'], toolNames: ['BriefTool'] },
]

/**
 * Check if a user message indicates a simple conversation that doesn't need
 * full tool set (e.g., "hi", "hello", "how are you").
 * Matches common greetings, small talk, and pure conversational messages.
 */
export function isSimpleConversationMessage(message: string): boolean {
  const msg = message.toLowerCase().trim()

  // Pure greetings and small talk — these don't need any code tools
  const simplePatterns: RegExp[] = [
    // English greetings
    /^(?:hi|hello|hey|hiya|g'day|good morning|good afternoon|good evening)(?:\s|$|[^\w\s])/,
    /^(?:how are you|how are you doing|how's it going|how's going)(?:\s|$|[^\w\s])/,
    /^(?:thanks|thank you|thanks a lot|thank you so much)(?:\s|$|[^\w\s])/,
    /^(?:ok|okay|got it|understood|alright)(?:\s|$|[^\w\s])/,
    /^(?:bye|goodbye|see you|talk to you later)(?:\s|$|[^\w\s])/,
    /^(?:test|testing)$/,
    // Chinese greetings / small talk
    /^(?:你好|哈喽|哈罗|嗨|hey|hi)(?:\s|$|[^\w\s])/,
    /^(?:你好吗|你好啊|最近怎么样|近来怎么样)(?:\s|$|[^\w\s])/,
    /^(?:谢谢|thanks|感谢|多谢|感恩)(?:\s|$|[^\w\s])/,
    /^(?:好的|知道了|明白|了解|好|行|可以|行了|好吧)(?:\s|$|[^\w\s])/,
    /^(?:bye|再见|拜拜|回见|下次见|下次再见)(?:\s|$|[^\w\s])/,
  ]

  // If the message is very short (< 30 chars) and matches a conversational pattern
  if (msg.length < 30) {
    for (const pattern of simplePatterns) {
      if (pattern.test(msg)) return true
    }
  }

  // Pure chit-chat without any code/tool keywords
  if (msg.length < 50) {
    const hasCodeKeywords = /\b(code|file|read|write|edit|git|bash|shell|tool|function|class|api|sql|database|web|http|search|grep|find|debug|fix|build|compile|test|run|deploy|docker|npm|node|python|java|go |rust|typescript|javascript|react|vue|angular)\b/.test(msg)
    // Also check common Chinese code-related terms
    const hasChineseCodeKeywords = /[\u4e00-\u9fa5]+(?:代码|文件|读取|编辑|搜索|修复|运行|测试|构建|部署|数据库|接口|命令|脚本|函数|类|网页|抓取|下载|版本|分支|合并|提交|推送|拉取)\b/.test(msg)
    if (!hasCodeKeywords && !hasChineseCodeKeywords && simplePatterns.some(p => p.test(msg))) return true
  }

  return false
}

/**
 * Cache key for filter results. We use a hash of the message content
 * (lowercased, truncated) plus a hash of the tool names to detect changes.
 */
function buildFilterCacheKey(tools: Tools, message: string): string {
  const toolSig = tools.map(t => t.name).sort().join(',')
  const msgKey = message.toLowerCase().trim().slice(0, 300)
  return `${msgKey}\n---\n${toolSig}`
}

// Cache for filterToolsForMessage results — avoids recomputing the same
// message+toolset combination. The cache is bounded by a Map with LRU behavior:
// we only keep recent results, and clear the cache on /clear or session reset.
const _toolFilterCache = new Map<string, Set<string>>()

/** Clear the tool filter cache — called on session reset, /clear, /compact. */
export function clearToolFilterCache(): void {
  _toolFilterCache.clear()
}

/**
 * Filter tools based on user message content.
 * When the message is simple (chit-chat, greeting), only return always-on tools.
 * Otherwise, use keyword matching to include additional relevant tools.
 *
 * Results are cached by (message + toolSet signature) for O(1) lookups on
 * repeated messages or cached system prompts.
 *
 * @param tools - The full set of available tools
 * @param message - The user's message text
 * @returns Filtered tool list optimized for the message content
 */
export function filterToolsForMessage(tools: Tools, message: string): Tools {
  // Check cache first
  const cacheKey = buildFilterCacheKey(tools, message)
  const cached = _toolFilterCache.get(cacheKey)
  if (cached) {
    return tools.filter(t => cached.has(t.name))
  }

  const msg = message.toLowerCase()

  // Build set of tool names to include based on message content
  const toolNamesToInclude = new Set<string>(ALWAYS_ON_TOOLS)

  if (isSimpleConversationMessage(msg)) {
    // For simple conversations, only always-on tools
  } else {
    // Build set of tool names to include based on keyword matching
    for (const { keywords, toolNames } of TOOL_KEYWORD_MAP) {
      for (const keyword of keywords) {
        if (msg.includes(keyword)) {
          for (const toolName of toolNames) {
            toolNamesToInclude.add(toolName)
          }
          break // Don't add same tool twice for same keyword group
        }
      }
    }

    // Add tools that match by name in message (e.g., "use FileReadTool")
    for (const tool of tools) {
      if (toolNamesToInclude.has(tool.name)) continue
      // Check if tool name or a shortened version appears in the message
      const toolNameLower = tool.name.toLowerCase()
      const shortName = toolNameLower.replace(/tool$/, '')
      if (msg.includes(toolNameLower) || msg.includes(shortName)) {
        toolNamesToInclude.add(tool.name)
      }
    }
  }

  // MCP 工具默认总是包含——它们是用户提供的，应在相关话题下可用。
  // 但首轮简单问候（"hi"/"hello"）时跳过：MCP 工具应通过 ToolSearch
  // 的 defer_loading 机制按需发现，而非在问候轮全量注入。
  if (!isSimpleConversationMessage(message)) {
    for (const tool of tools) {
      if (tool.isMcp) {
        toolNamesToInclude.add(tool.name)
      }
    }
  }

  // Cache the result
  _toolFilterCache.set(cacheKey, toolNamesToInclude)

  return tools.filter(tool => toolNamesToInclude.has(tool.name))
}

// === 技能长尾的树状渐进过滤（方案 A） ===
// 与工具的消息过滤同源：bundled + MCP 技能始终保留（核心、量小、意图明确），
// 长尾技能（skills/plugin/commands_DEPRECATED/managed 等来源）仅当
// name/description/whenToUse 与用户消息 token 有词面重叠时才保留。

// 停用词：低频信息量的常见词，避免误匹配长尾技能。
const SKILL_FILTER_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'to', 'of', 'in', 'on', 'for',
  'with', 'is', 'are', 'be', 'do', 'does', 'it', 'this', 'that', 'what',
  'which', 'who', 'how', 'my', 'your', 'our', 'their', 'we', 'you', 'i',
  '的', '了', '和', '是', '在', '有', '我', '你', '他', '她', '它', '们',
  '这', '那', '就', '都', '而', '及', '与', '或', '一个', '没有', '可以',
  '什么', '怎么', '为什么', '要', '会', '能', '被', '让', '把', '给', '对',
  '从', '到', '上', '下', '里', '中', '做', '用', '去', '来', '还', '也',
])

/**
 * 将用户消息拆分为有信息量的 token，用于与技能的 name/description/whenToUse
 * 做词面匹配。英文 token 需长度 ≥ 3 才保留（过滤 "hi"/"a" 等噪声）；中文
 * token 意义密度高，任意长度保留（单字也保留，中文单字如"测""迁"仍具区分度）。
 */
function tokenizeSkillMessage(message: string): string[] {
  const raw = message
    .toLowerCase()
    .split(/[\s,.;:!?，。；：！？、"'()\[\]{}<>/\\|@#$%^&*+=~`—-]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)

  const tokens: string[] = []
  for (const t of raw) {
    if (SKILL_FILTER_STOPWORDS.has(t)) continue
    // 含中文：中文无空格分界，整串无法作为匹配单元，因此展开为 bi-gram
    // （连续双字），使 "数据库迁移" 这类技能描述能被 "迁移"/"数据" 命中。
    // 启发式过滤宁可多发不可漏发，因此接受 bi-gram 带来的少量误匹配。
    if (/[\u4e00-\u9fa5]/.test(t)) {
      const han = t.replace(/[^\u4e00-\u9fa5]/g, '')
      if (han.length === 1) {
        tokens.push(han)
      } else {
        for (let i = 0; i + 1 < han.length; i++) {
          tokens.push(han.slice(i, i + 2))
        }
      }
      continue
    }
    // 纯英文/数字：长度 ≥ 3
    if (t.length >= 3) tokens.push(t)
  }
  return tokens
}

/**
 * 判断某个技能是否与用户消息的 token 有词面重叠。
 * 在 name + description + whenToUse 的拼接里做大小写不敏感的包含匹配。
 */
function skillMatchesTokens(cmd: Command, tokens: string[]): boolean {
  if (tokens.length === 0) return false
  const haystack = `${cmd.name} ${cmd.description ?? ''} ${cmd.whenToUse ?? ''}`.toLowerCase()
  return tokens.some(t => haystack.includes(t))
}

/**
 * 按用户消息关键词过滤长尾技能，实现「树状渐进掺入」。
 * bundled + MCP 技能始终保留（核心、量小、意图明确）；长尾技能
 * （skills/plugin/commands_DEPRECATED/managed 等来源）仅当 name/description/
 * whenToUse 与消息 token 有词面重叠时才保留。
 *
 * 返回「候选技能全集」——与 sentSkillNames 增量 diff 结合后，
 * 已发送的技能会被跳过，从而实现「已发不重发」+「按需渐进」。
 */
export function filterSkillsForMessage(
  commands: Command[],
  message: string,
): Command[] {
  const tokens = tokenizeSkillMessage(message)
  const core = commands.filter(
    cmd => cmd.loadedFrom === 'bundled' || cmd.loadedFrom === 'mcp',
  )
  const matchedTail = commands.filter(cmd => {
    if (cmd.loadedFrom === 'bundled' || cmd.loadedFrom === 'mcp') return false
    return skillMatchesTokens(cmd, tokens)
  })
  return uniqBy([...core, ...matchedTail], 'name')
}
// FORCE_RECOMPILE_2026_07_23_2300
