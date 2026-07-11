/**
 * 为打破导入循环而提取的纯权限类型定义。
 *
 * 该文件仅包含类型定义和常量，没有运行时依赖项。
 * 实现文件仍位于 src/utils/permissions/，但现在可以从此处导入
 * 以避免循环依赖。
 */
import { feature } from 'bun:bundle';
// ============================================================================
// 权限模式
// ============================================================================
export const EXTERNAL_PERMISSION_MODES = [
    'acceptEdits',
    'bypassPermissions',
    'default',
    'dontAsk',
    'plan',
];
// 运行时验证集：用户可设置的模式（settings.json 的 defaultMode、
// --permission-mode CLI 标志、对话恢复）。
export const INTERNAL_PERMISSION_MODES = [
    ...EXTERNAL_PERMISSION_MODES,
    ...(feature('TRANSCRIPT_CLASSIFIER') ? ['auto'] : []),
];
export const PERMISSION_MODES = INTERNAL_PERMISSION_MODES;
