let builders = null;
export function registerMCPSkillBuilders(b) {
    builders = b;
}
export function getMCPSkillBuilders() {
    if (!builders) {
        throw new Error('MCP 技能构建器未注册——loadSkillsDir.ts 尚未被评估');
    }
    return builders;
}
