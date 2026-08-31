/**
 * 解析面向用户的名称，若未覆盖则回退到 `cmd.name`。
 */
export function getCommandName(cmd) {
    return cmd.userFacingName?.() ?? cmd.name;
}
/**
 * 解析命令是否启用，默认为 true。
 */
export function isCommandEnabled(cmd) {
    return cmd.isEnabled?.() ?? true;
}
/**
 * 验证技能栈组合兼容性（吸收自 AAS Core stackCompatible）。
 * 当 composable=true 时，检查 stackCompatible 中声明的兼容技能是否都可用。
 */
export function validateStackCompatibility(cmd, availableSkillIds) {
    const stackCompatible = cmd.stackCompatible ?? [];
    const missing = stackCompatible.filter(id => !availableSkillIds.has(id));
    return { valid: missing.length === 0, missing };
}
