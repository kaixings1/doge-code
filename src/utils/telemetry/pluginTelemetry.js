/**
 * Plugin telemetry helpers — shared field builders for plugin lifecycle events.
 *
 * Implements the twin-column privacy pattern: every user-defined-name field
 * emits both a raw value (routed to PII-tagged _PROTO_* BQ columns) and a
 * redacted twin (real name iff marketplace ∈ allowlist, else 'third-party').
 *
 * plugin_id_hash provides an opaque per-plugin aggregation key with no privacy
 * dependency — sha256(name@marketplace + FIXED_SALT) truncated to 16 chars.
 * This answers distinct-count and per-plugin-trend questions that the
 * redacted column can't, without exposing user-defined names.
 */
import { createHash } from 'crypto';
import { sep } from 'path';
import { logEvent, } from '../../services/analytics/index.js';
import { isOfficialMarketplaceName, parsePluginIdentifier, } from '../plugins/pluginIdentifier.js';
// builtinPlugins.ts:BUILTIN_MARKETPLACE_NAME — inlined to avoid the cycle
// through commands.js. Marketplace schemas.ts enforces 'builtin' is reserved.
const BUILTIN_MARKETPLACE_NAME = 'builtin';
// Fixed salt for plugin_id_hash. Same constant across all repos and emission
// sites. Not per-org, not rotated — per-org salt would defeat cross-org
// distinct-count, rotation would break trend lines. Customers can compute the
// same hash on their known plugin names to reverse-match their own telemetry.
const PLUGIN_ID_HASH_SALT = 'claude-plugin-telemetry-v1';
/**
 * Opaque per-plugin aggregation key. Input is the name@marketplace string as
 * it appears in enabledPlugins keys, lowercased on the marketplace suffix for
 * reproducibility. 16-char truncation keeps BQ GROUP BY cardinality manageable
 * while making collisions negligible at projected 10k-plugin scale. Name case
 * is preserved in both branches (enabledPlugins keys are case-sensitive).
 */
export function hashPluginId(name, marketplace) {
    const key = marketplace ? `${name}@${marketplace.toLowerCase()}` : name;
    return createHash('sha256')
        .update(key + PLUGIN_ID_HASH_SALT)
        .digest('hex')
        .slice(0, 16);
}
export function getTelemetryPluginScope(name, marketplace, managedNames) {
    if (marketplace === BUILTIN_MARKETPLACE_NAME)
        return 'default-bundle';
    if (isOfficialMarketplaceName(marketplace))
        return 'official';
    if (managedNames?.has(name))
        return 'org';
    return 'user-local';
}
export function getEnabledVia(plugin, managedNames, seedDirs) {
    if (plugin.isBuiltin)
        return 'default-enable';
    if (managedNames?.has(plugin.name))
        return 'org-policy';
    // Trailing sep: /opt/plugins must not match /opt/plugins-extra
    if (seedDirs.some(dir => plugin.path.startsWith(dir.endsWith(sep) ? dir : dir + sep))) {
        return 'seed-mount';
    }
    return 'user-install';
}
/**
 * Common plugin telemetry fields keyed off name@marketplace. Returns the
 * hash, scope enum, and the redacted-twin columns. Callers add the raw
 * _PROTO_* fields separately (those require the PII-tagged marker type).
 */
export function buildPluginTelemetryFields(name, marketplace, managedNames = null) {
    const scope = getTelemetryPluginScope(name, marketplace, managedNames);
    // Both official marketplaces and builtin plugins are Anthropic-controlled
    // — safe to expose real names in the redacted columns.
    const isAnthropicControlled = scope === 'official' || scope === 'default-bundle';
    return {
        plugin_id_hash: hashPluginId(name, marketplace),
        plugin_scope: scope,
        plugin_name_redacted: (isAnthropicControlled
            ? name
            : 'third-party'),
        marketplace_name_redacted: (isAnthropicControlled && marketplace
            ? marketplace
            : 'third-party'),
        is_official_plugin: isAnthropicControlled,
    };
}
/**
 * Per-invocation callers (SkillTool, processSlashCommand) pass
 * managedNames=null — the session-level tengu_plugin_enabled_for_session
 * event carries the authoritative plugin_scope, and per-invocation rows can
 * join on plugin_id_hash to recover it. This keeps hot-path call sites free
 * of the extra settings read.
 */
export function buildPluginCommandTelemetryFields(pluginInfo, managedNames = null) {
    const { marketplace } = parsePluginIdentifier(pluginInfo.repository);
    return buildPluginTelemetryFields(pluginInfo.pluginManifest.name, marketplace, managedNames);
}
/**
 * Emit tengu_plugin_enabled_for_session once per enabled plugin at session
 * start. Supplements tengu_skill_loaded (which still fires per-skill) — use
 * this for plugin-level aggregates instead of DISTINCT-on-prefix hacks.
 * A plugin with 5 skills emits 5 skill_loaded rows but 1 of these.
 */
export function logPluginsEnabledForSession(plugins, managedNames, seedDirs) {
    for (const plugin of plugins) {
        const { marketplace } = parsePluginIdentifier(plugin.repository);
        logEvent('tengu_plugin_enabled_for_session', {
            _PROTO_plugin_name: plugin.name,
            ...(marketplace && {
                _PROTO_marketplace_name: marketplace,
            }),
            ...buildPluginTelemetryFields(plugin.name, marketplace, managedNames),
            enabled_via: getEnabledVia(plugin, managedNames, seedDirs),
            skill_path_count: (plugin.skillsPath ? 1 : 0) + (plugin.skillsPaths?.length ?? 0),
            command_path_count: (plugin.commandsPath ? 1 : 0) + (plugin.commandsPaths?.length ?? 0),
            has_mcp: plugin.manifest.mcpServers !== undefined,
            has_hooks: plugin.hooksConfig !== undefined,
            ...(plugin.manifest.version && {
                version: plugin.manifest
                    .version,
            }),
        });
    }
}
export function classifyPluginCommandError(error) {
    const msg = String(error?.message ?? error);
    if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|ECONNRESET|network|Could not resolve|Connection refused|timed out/i.test(msg)) {
        return 'network';
    }
    if (/\b404\b|not found|does not exist|no such plugin/i.test(msg)) {
        return 'not-found';
    }
    if (/\b40[13]\b|EACCES|EPERM|permission denied|unauthorized/i.test(msg)) {
        return 'permission';
    }
    if (/invalid|malformed|schema|validation|parse error/i.test(msg)) {
        return 'validation';
    }
    return 'unknown';
}
/**
 * Emit tengu_plugin_load_failed once per error surfaced by session-start
 * plugin loading. Pairs with tengu_plugin_enabled_for_session so dashboards
 * can compute a load-success rate. PluginError.type is already a bounded
 * enum — use it directly as error_category.
 */
export function logPluginLoadErrors(errors, managedNames) {
    for (const err of errors) {
        const { name, marketplace } = parsePluginIdentifier(err.source);
        // Not all PluginError variants carry a plugin name (some have pluginId,
        // some are marketplace-level). Use the 'plugin' property if present,
        // fall back to the name parsed from err.source.
        const pluginName = 'plugin' in err && err.plugin ? err.plugin : name;
        logEvent('tengu_plugin_load_failed', {
            error_category: err.type,
            _PROTO_plugin_name: pluginName,
            ...(marketplace && {
                _PROTO_marketplace_name: marketplace,
            }),
            ...buildPluginTelemetryFields(pluginName, marketplace, managedNames),
        });
    }
}
