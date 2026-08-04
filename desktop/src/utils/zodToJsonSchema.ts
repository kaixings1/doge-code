/**
 * Converts Zod v4 schemas to JSON Schema using native toJSONSchema.
 */

import { toJSONSchema, type ZodTypeAny } from 'zod/v4'

export type JsonSchema7Type = Record<string, unknown>

// toolToAPISchema() runs this for every tool on every API request (~60-250
// times/turn). Tool schemas are wrapped with lazySchema() which guarantees the
// same ZodTypeAny reference per session, so we can cache by identity.
const cache = new WeakMap<ZodTypeAny, JsonSchema7Type>()

/**
 * Converts a Zod v4 schema to JSON Schema format.
 * Returns a fallback empty schema if the input is not a valid Zod schema.
 */
export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema7Type {
  // 兜底：schema 不是有效的 Zod schema 时返回空对象 schema
  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {} }
  }
  const hit = cache.get(schema)
  if (hit) return hit
  try {
    const result = toJSONSchema(schema, { unrepresentable: 'any' }) as JsonSchema7Type
    // Zod v4 的 .transform() / ZodPipe 无法被 toJSONSchema 序列化，会返回仅含
    // $schema 的对象（缺少 type 字段）。OpenAI 兼容端点要求 type: "object"，
    // 因此在此兜底补全。
    if (!result.type) {
      result.type = 'object'
    }
    cache.set(schema, result)
    return result
  } catch (err) {
    // toJSONSchema 失败时返回空对象 schema
    return { type: 'object', properties: {} }
  }
}
