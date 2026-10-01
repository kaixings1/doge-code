import { z } from 'zod/v4'

/** Cap on the inline schema fragment so a pathological tool schema can't blow up the error text. */
export const INLINE_SCHEMA_MAX_CHARS = 2000

/**
 * Render a tool's input schema as a compact JSON fragment for inlining into a
 * validation error. Zero dependencies beyond zod so it can be unit-tested
 * without pulling in the ink/React import chain that toolExecution carries.
 *
 * This is what makes a deferred-tool failure self-healing in one round: a bare
 * "缺少必需参数 `taskId`" names the field but neither its type nor the sibling
 * parameters, so the model guesses. Carrying the real schema costs ~500 chars
 * and removes the ToolSearch round-trip entirely.
 *
 * Null on any failure (schema that can't convert, absurd size) — the caller
 * falls back to the ToolSearch hint, so this is best-effort by design.
 */
export function buildInlineSchemaFragment(schema: z.ZodType): string | null {
  try {
    const json = z.toJSONSchema(schema, {
      io: 'input',
      unrepresentable: 'any',
    }) as { properties?: Record<string, unknown>; required?: unknown }
    const properties = json.properties ?? {}
    // 空 properties 意味着转换没拿到真实形状（如 z.custom 落成 `{}`）。
    // 此时内联片段只会误导模型，回退给调用方走 ToolSearch。
    if (Object.keys(properties).length === 0) return null
    const fragment = JSON.stringify({
      required: json.required ?? [],
      properties,
    })
    if (fragment.length > INLINE_SCHEMA_MAX_CHARS) return null
    return fragment
  } catch {
    return null
  }
}
