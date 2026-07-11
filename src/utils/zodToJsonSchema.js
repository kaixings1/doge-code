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
    const result = toJSONSchema(schema);
    cache.set(schema, result);
    return result;
}
