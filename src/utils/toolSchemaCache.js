const TOOL_SCHEMA_CACHE = new Map();
export function getToolSchemaCache() {
    return TOOL_SCHEMA_CACHE;
}
export function clearToolSchemaCache() {
    TOOL_SCHEMA_CACHE.clear();
}
