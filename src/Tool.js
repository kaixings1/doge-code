export const getEmptyToolPermissionContext = () => ({
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
});
export function filterToolProgressMessages(progressMessagesForMessage) {
    return progressMessagesForMessage.filter((msg) => msg.data?.type !== 'hook_progress');
}
/**
 * 检查工具是否与给定名称匹配（主名称或别名）。
 */
export function toolMatchesName(tool, name) {
    return tool.name === name || (tool.aliases?.includes(name) ?? false);
}
/**
 * 从工具列表中按名称或别名查找工具。
 */
export function findToolByName(tools, name) {
    return tools.find(t => toolMatchesName(t, name));
}
/**
 * 从部分定义构建完整的 `Tool`，为常用存根方法填充安全默认值。
 * 所有工具导出都应通过此函数，以便默认值位于一处，调用者永远不需要 `?.() ?? default`。
 *
 * 默认值（在重要之处失败关闭）：
 * - `isEnabled` → `true`
 * - `isConcurrencySafe` → `false`（假定不安全）
 * - `isReadOnly` → `false`（假定写入）
 * - `isDestructive` → `false`
 * - `checkPermissions` → `{ behavior: 'allow', updatedInput }`（遵从通用权限系统）
 * - `toAutoClassifierInput` → `''`（跳过分类器 —— 与安全相关的工具必须覆盖）
 * - `userFacingName` → `name`
 */
const TOOL_DEFAULTS = {
    isEnabled: () => true,
    isConcurrencySafe: (_input) => false,
    isReadOnly: (_input) => false,
    isDestructive: (_input) => false,
    checkPermissions: (input, _ctx) => Promise.resolve({ behavior: 'allow', updatedInput: input }),
    toAutoClassifierInput: (_input) => '',
    userFacingName: (_input) => '',
};
export function buildTool(def) {
    // 运行时展开很简单；`as` 弥合了结构性 any 约束与精确的 BuiltTool<D> 返回之间的差距。
    // 类型语义已在所有 60 多个工具上通过零错误类型检查得到验证。
    return {
        ...TOOL_DEFAULTS,
        userFacingName: () => def.name,
        ...def,
    };
}
