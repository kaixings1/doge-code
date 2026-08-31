/**
 * Converts Zod v4 schemas to JSON Schema using native toJSONSchema.
 */
import { toJSONSchema } from 'zod/v4';
// toolToAPISchema() runs this for every tool on every API request (~60-250
// times/turn). Tool schemas are wrapped with lazySchema() which guarantees the
// same ZodTypeAny reference per session, so we can cache by identity.
const cache = new WeakMap();
/**
 * Converts a Zod v4 schema to JSON Schema format.
 */
export function zodToJsonSchema(schema) {
    const hit = cache.get(schema);
    if (hit)
        return hit;
    const result = toJSONSchema(schema, { unrepresentable: 'any' });
    // Zod v4 的 .transform() / ZodPipe 无法被 toJSONSchema 序列化，会返回仅含
    // $schema 的对象（缺少 type 字段）。OpenAI 兼容端点要求 type: "object"，
    // 因此在此兜底补全。
    if (!result.type) {
        result.type = 'object';
    }
    cache.set(schema, result);
    return result;
}
