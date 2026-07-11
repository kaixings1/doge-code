/**
 * Team Memory Sync Types
 *
 * Zod schemas and types for the repo-scoped team memory sync API.
 * Based on the backend API contract from anthropic/anthropic#250711.
 */
import { z } from 'zod/v4';
import { lazySchema } from '../../utils/lazySchema.js';
/**
 * Content portion of team memory data - flat key-value storage.
 * Keys are file paths relative to the team memory directory (e.g. "MEMORY.md", "patterns.md").
 * Values are UTF-8 string content (typically Markdown).
 */
export const TeamMemoryContentSchema = lazySchema(() => z.object({
    entries: z.record(z.string(), z.string()),
    // Per-key SHA-256 of entry content (`sha256:<hex>`). Added in
    // anthropic/anthropic#283027. Optional for forward-compat with older
    // server deployments; empty map when entries is empty.
    entryChecksums: z.record(z.string(), z.string()).optional(),
}));
/**
 * Full response from GET /api/claude_code/team_memory
 */
export const TeamMemoryDataSchema = lazySchema(() => z.object({
    organizationId: z.string(),
    repo: z.string(),
    version: z.number(),
    lastModified: z.string(), // ISO 8601 timestamp
    checksum: z.string(), // SHA256 with 'sha256:' prefix
    content: TeamMemoryContentSchema(),
}));
/**
 * Structured 413 error body from the server (anthropic/anthropic#293258).
 * The server's RequestTooLargeException serializes error_code and the
 * extra_details dict flattened into error.details. We only model the
 * too-many-entries case; entry-too-large is handled via MAX_FILE_SIZE_BYTES
 * pre-check on the client side and would need a separate schema.
 */
export const TeamMemoryTooManyEntriesSchema = lazySchema(() => z.object({
    error: z.object({
        details: z.object({
            error_code: z.literal('team_memory_too_many_entries'),
            max_entries: z.number().int().positive(),
            received_entries: z.number().int().positive(),
        }),
    }),
}));
