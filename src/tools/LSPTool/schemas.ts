import { z } from 'zod/v4'
import { lazySchema } from '../../utils/lazySchema.js'

/**
 * Discriminated union of all LSP operations
 * Uses 'operation' as the discriminator field
 */
export const lspToolInputSchema = lazySchema(() => {
  /**
   * Go to Definition operation
   * Finds the definition location of a symbol at the given position
   */
  const goToDefinitionSchema = z.strictObject({
    operation: z.literal('goToDefinition'),
    filePath: z.string().describe('文件的绝对或相对路径'),
    line: z
      .number()
      .int()
      .positive()
      .describe('行号（从 1 开始，与编辑器显示一致）'),
    character: z
      .number()
      .int()
      .positive()
      .describe('字符偏移量（从 1 开始，与编辑器显示一致）'),
  })

  /**
   * Find References operation
   * Finds all references to a symbol at the given position
   */
  const findReferencesSchema = z.strictObject({
    operation: z.literal('findReferences'),
    filePath: z.string().describe('文件的绝对或相对路径'),
    line: z
      .number()
      .int()
      .positive()
      .describe('行号（从 1 开始，与编辑器显示一致）'),
    character: z
      .number()
      .int()
      .positive()
      .describe('字符偏移量（从 1 开始，与编辑器显示一致）'),
  })

  /**
   * Hover operation
   * Gets hover information (documentation, type info) for a symbol at the given position
   */
  const hoverSchema = z.strictObject({
    operation: z.literal('hover'),
    filePath: z.string().describe('文件的绝对或相对路径'),
    line: z
      .number()
      .int()
      .positive()
      .describe('行号（从 1 开始，与编辑器显示一致）'),
    character: z
      .number()
      .int()
      .positive()
      .describe('字符偏移量（从 1 开始，与编辑器显示一致）'),
  })

  /**
   * Document Symbol operation
   * Gets all symbols (functions, classes, variables) in a document
   */
  const documentSymbolSchema = z.strictObject({
    operation: z.literal('documentSymbol'),
    filePath: z.string().describe('文件的绝对或相对路径'),
    line: z
      .number()
      .int()
      .positive()
      .describe('行号（从 1 开始，与编辑器显示一致）'),
    character: z
      .number()
      .int()
      .positive()
      .describe('字符偏移量（从 1 开始，与编辑器显示一致）'),
  })

  /**
   * Workspace Symbol operation
   * Searches for symbols across the entire workspace
   */
  const workspaceSymbolSchema = z.strictObject({
    operation: z.literal('workspaceSymbol'),
    filePath: z.string().describe('文件的绝对或相对路径'),
    line: z
      .number()
      .int()
      .positive()
      .describe('行号（从 1 开始，与编辑器显示一致）'),
    character: z
      .number()
      .int()
      .positive()
      .describe('字符偏移量（从 1 开始，与编辑器显示一致）'),
  })

  /**
   * Go to Implementation operation
   * Finds the implementation locations of an interface or abstract method
   */
  const goToImplementationSchema = z.strictObject({
    operation: z.literal('goToImplementation'),
    filePath: z.string().describe('文件的绝对或相对路径'),
    line: z
      .number()
      .int()
      .positive()
      .describe('行号（从 1 开始，与编辑器显示一致）'),
    character: z
      .number()
      .int()
      .positive()
      .describe('字符偏移量（从 1 开始，与编辑器显示一致）'),
  })

  /**
   * Prepare Call Hierarchy operation
   * Prepares a call hierarchy item at the given position (first step for call hierarchy)
   */
  const prepareCallHierarchySchema = z.strictObject({
    operation: z.literal('prepareCallHierarchy'),
    filePath: z.string().describe('文件的绝对或相对路径'),
    line: z
      .number()
      .int()
      .positive()
      .describe('行号（从 1 开始，与编辑器显示一致）'),
    character: z
      .number()
      .int()
      .positive()
      .describe('字符偏移量（从 1 开始，与编辑器显示一致）'),
  })

  /**
   * Incoming Calls operation
   * Finds all functions/methods that call the function at the given position
   */
  const incomingCallsSchema = z.strictObject({
    operation: z.literal('incomingCalls'),
    filePath: z.string().describe('文件的绝对或相对路径'),
    line: z
      .number()
      .int()
      .positive()
      .describe('行号（从 1 开始，与编辑器显示一致）'),
    character: z
      .number()
      .int()
      .positive()
      .describe('字符偏移量（从 1 开始，与编辑器显示一致）'),
  })

  /**
   * Outgoing Calls operation
   * Finds all functions/methods called by the function at the given position
   */
  const outgoingCallsSchema = z.strictObject({
    operation: z.literal('outgoingCalls'),
    filePath: z.string().describe('文件的绝对或相对路径'),
    line: z
      .number()
      .int()
      .positive()
      .describe('行号（从 1 开始，与编辑器显示一致）'),
    character: z
      .number()
      .int()
      .positive()
      .describe('字符偏移量（从 1 开始，与编辑器显示一致）'),
  })

  /**
   * List Diagnostics operation
   * Queries the LSP diagnostic registry for available diagnostics.
   * Optionally filter by filePath. Does not require line/character.
   */
  const listDiagnosticsSchema = z.strictObject({
    operation: z.literal('listDiagnostics'),
    filePath: z.string().describe('要查询诊断的文件路径（可选，留空则返回所有文件）'),
    line: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('行号（可选）'),
    character: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('字符偏移量（可选）'),
  })

  return z.discriminatedUnion('operation', [
    goToDefinitionSchema,
    findReferencesSchema,
    hoverSchema,
    documentSymbolSchema,
    workspaceSymbolSchema,
    goToImplementationSchema,
    prepareCallHierarchySchema,
    incomingCallsSchema,
    outgoingCallsSchema,
    listDiagnosticsSchema,
  ])
})

/**
 * TypeScript type for LSPTool input
 */
export type LSPToolInput = z.infer<ReturnType<typeof lspToolInputSchema>>

/**
 * Type guard to check if an operation is a valid LSP operation
 */
export function isValidLSPOperation(
  operation: string,
): operation is LSPToolInput['operation'] {
  return [
    'goToDefinition',
    'findReferences',
    'hover',
    'documentSymbol',
    'workspaceSymbol',
    'goToImplementation',
    'prepareCallHierarchy',
    'incomingCalls',
    'outgoingCalls',
    'listDiagnostics',
  ].includes(operation)
}
