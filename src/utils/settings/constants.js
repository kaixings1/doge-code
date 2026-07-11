import { getAllowedSettingSources } from '../../bootstrap/state.js';
/**
 * All possible sources where settings can come from
 * Order matters - later sources override earlier ones
 */
export const SETTING_SOURCES = [
    // User settings (global)
    'userSettings',
    // Project settings (shared per-directory)
    'projectSettings',
    // Local settings (gitignored)
    'localSettings',
    // Flag settings (from --settings flag)
    'flagSettings',
    // Policy settings (managed-settings.json or remote settings from API)
    'policySettings',
];
export function getSettingSourceName(source) {
    switch (source) {
        case 'userSettings':
            return 'user';
        case 'projectSettings':
            return 'project';
        case 'localSettings':
            return 'project, gitignored';
        case 'flagSettings':
            return 'cli flag';
        case 'policySettings':
            return 'managed';
    }
}
/**
 * Get short display name for a setting source (capitalized, for context/skills UI)
 * @param source The setting source or 'plugin'/'built-in'
 * @returns Short capitalized display name like 'User', 'Project', 'Plugin'
 */
export function getSourceDisplayName(source) {
    switch (source) {
        case 'userSettings':
            return '用户';
        case 'projectSettings':
            return '项目';
        case 'localSettings':
            return '本地';
        case 'flagSettings':
            return '标志';
        case 'policySettings':
            return '管理';
        case 'plugin':
            return '插件';
        case 'built-in':
            return '内置';
    }
}
/**
 * Get display name for a setting or permission rule source (lowercase, for inline use)
 * @param source The setting source or permission rule source
 * @returns Display name for the source in lowercase
 */
export function getSettingSourceDisplayNameLowercase(source) {
    switch (source) {
        case 'userSettings':
            return '用户设置';
        case 'projectSettings':
            return '共享项目设置';
        case 'localSettings':
            return '项目本地设置';
        case 'flagSettings':
            return '命令行参数';
        case 'policySettings':
            return '企业管理设置';
        case 'cliArg':
            return 'CLI 参数';
        case 'command':
            return '命令配置';
        case 'session':
            return '当前会话';
    }
}
/**
 * Get display name for a setting or permission rule source (capitalized, for UI labels)
 * @param source The setting source or permission rule source
 * @returns Display name for the source with first letter capitalized
 */
export function getSettingSourceDisplayNameCapitalized(source) {
    switch (source) {
        case 'userSettings':
            return '用户设置';
        case 'projectSettings':
            return '共享项目设置';
        case 'localSettings':
            return '项目本地设置';
        case 'flagSettings':
            return '命令行参数';
        case 'policySettings':
            return '企业管理设置';
        case 'cliArg':
            return 'CLI 参数';
        case 'command':
            return '命令配置';
        case 'session':
            return '当前会话';
    }
}
/**
 * Parse the --setting-sources CLI flag into SettingSource array
 * @param flag Comma-separated string like "user,project,local"
 * @returns Array of SettingSource values
 */
export function parseSettingSourcesFlag(flag) {
    if (flag === '')
        return [];
    const names = flag.split(',').map(s => s.trim());
    const result = [];
    for (const name of names) {
        switch (name) {
            case 'user':
                result.push('userSettings');
                break;
            case 'project':
                result.push('projectSettings');
                break;
            case 'local':
                result.push('localSettings');
                break;
            default:
                throw new Error(`无效的设置源：${name}。有效选项为：user、project、local`);
        }
    }
    return result;
}
/**
 * Get enabled setting sources with policy/flag always included
 * @returns Array of enabled SettingSource values
 */
export function getEnabledSettingSources() {
    const allowed = getAllowedSettingSources();
    // Always include policy and flag settings
    const result = new Set(allowed);
    result.add('policySettings');
    result.add('flagSettings');
    return Array.from(result);
}
/**
 * Check if a specific source is enabled
 * @param source The source to check
 * @returns true if the source should be loaded
 */
export function isSettingSourceEnabled(source) {
    const enabled = getEnabledSettingSources();
    return enabled.includes(source);
}
/**
 * List of sources where permission rules can be saved, in display order.
 * Used by permission-rule and hook-save UIs to present source options.
 */
export const SOURCES = [
    'localSettings',
    'projectSettings',
    'userSettings',
];
/**
 * The JSON Schema URL for Claude Code settings
 * You can edit the contents at https://github.com/SchemaStore/schemastore/blob/master/src/schemas/json/claude-code-settings.json
 */
export const CLAUDE_CODE_SETTINGS_SCHEMA_URL = 'https://json.schemastore.org/claude-code-settings.json';
