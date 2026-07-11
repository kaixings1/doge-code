import { feature } from 'bun:bundle';
import z from 'zod/v4';
import { PAUSE_ICON } from '../../constants/figures.js';
// Types extracted to src/types/permissions.ts to break import cycles
import { EXTERNAL_PERMISSION_MODES, PERMISSION_MODES, } from '../../types/permissions.js';
import { lazySchema } from '../lazySchema.js';
// Re-export for backwards compatibility
export { EXTERNAL_PERMISSION_MODES, PERMISSION_MODES, };
export const permissionModeSchema = lazySchema(() => z.enum(PERMISSION_MODES));
export const externalPermissionModeSchema = lazySchema(() => z.enum(EXTERNAL_PERMISSION_MODES));
const PERMISSION_MODE_CONFIG = {
    default: {
        title: '默认',
        shortTitle: '默认',
        symbol: '',
        color: 'text',
        external: 'default',
    },
    plan: {
        title: '计划模式',
        shortTitle: '计划',
        symbol: PAUSE_ICON,
        color: 'planMode',
        external: 'plan',
    },
    acceptEdits: {
        title: '接受编辑',
        shortTitle: '接受',
        symbol: '⏵⏵',
        color: 'autoAccept',
        external: 'acceptEdits',
    },
    bypassPermissions: {
        title: '绕过权限',
        shortTitle: '绕过',
        symbol: '⏵⏵',
        color: 'error',
        external: 'bypassPermissions',
    },
    dontAsk: {
        title: '不再询问',
        shortTitle: '不询问',
        symbol: '⏵⏵',
        color: 'error',
        external: 'dontAsk',
    },
    ...(feature('TRANSCRIPT_CLASSIFIER')
        ? {
            auto: {
                title: '自动模式',
                shortTitle: '自动',
                symbol: '⏵⏵',
                color: 'warning',
                external: 'default',
            },
        }
        : {}),
};
/**
 * Type guard to check if a PermissionMode is an ExternalPermissionMode.
 * auto is ant-only and excluded from external modes.
 */
export function isExternalPermissionMode(mode) {
    // External users can't have auto, so always true for them
    if (process.env.USER_TYPE !== 'ant') {
        return true;
    }
    return mode !== 'auto' && mode !== 'bubble';
}
function getModeConfig(mode) {
    return PERMISSION_MODE_CONFIG[mode] ?? PERMISSION_MODE_CONFIG.default;
}
export function toExternalPermissionMode(mode) {
    return getModeConfig(mode).external;
}
export function permissionModeFromString(str) {
    return PERMISSION_MODES.includes(str)
        ? str
        : 'default';
}
export function permissionModeTitle(mode) {
    return getModeConfig(mode).title;
}
export function isDefaultMode(mode) {
    return mode === 'default' || mode === undefined;
}
export function permissionModeShortTitle(mode) {
    return getModeConfig(mode).shortTitle;
}
export function permissionModeSymbol(mode) {
    return getModeConfig(mode).symbol;
}
export function getModeColor(mode) {
    return getModeConfig(mode).color;
}
