/**
 * Settings Sync Types
 *
 * Zod schemas and types for the user settings sync API.
 * Based on the backend API contract from anthropic/anthropic#218817.
 */
import { z } from 'zod/v4';
import { lazySchema } from '../../utils/lazySchema.js';
/**
 * Content portion of user sync data - flat key-value storage.
 * Keys are opaque strings (typically file paths).
 * Values are UTF-8 string content (JSON, Markdown, etc).
 */
export const UserSyncContentSchema = lazySchema(() => z.object({
    entries: z.record(z.string(), z.string()),
}));
/**
 * Full response from GET /api/claude_code/user_settings
 */
export const UserSyncDataSchema = lazySchema(() => z.object({
    userId: z.string(),
    version: z.number(),
    lastModified: z.string(), // ISO 8601 timestamp
    checksum: z.string(), // MD5 hash
    content: UserSyncContentSchema(),
}));
/**
 * Keys used for sync entries
 */
export const SYNC_KEYS = {
    USER_SETTINGS: '~/.claude/settings.json',
    USER_MEMORY: '~/.claude/CLAUDE.md',
    projectSettings: (projectId) => `projects/${projectId}/.claude/settings.local.json`,
    projectMemory: (projectId) => `projects/${projectId}/CLAUDE.local.md`,
};
