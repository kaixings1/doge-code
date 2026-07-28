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
//# sourceMappingURL=command.js.map