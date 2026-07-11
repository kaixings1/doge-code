// Stub for external builds - classifier permissions feature is ANT-ONLY
export const PROMPT_PREFIX = 'prompt:';
export function extractPromptDescription(_ruleContent) {
    return null;
}
export function createPromptRuleContent(description) {
    return `${PROMPT_PREFIX} ${description.trim()}`;
}
export function isClassifierPermissionsEnabled() {
    return false;
}
export function getBashPromptDenyDescriptions(_context) {
    return [];
}
export function getBashPromptAskDescriptions(_context) {
    return [];
}
export function getBashPromptAllowDescriptions(_context) {
    return [];
}
export async function classifyBashCommand(_command, _cwd, _descriptions, _behavior, _signal, _isNonInteractiveSession) {
    return {
        matches: false,
        confidence: 'high',
        reason: '此功能已禁用',
    };
}
export async function generateGenericDescription(_command, specificDescription, _signal) {
    return specificDescription || null;
}
