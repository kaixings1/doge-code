import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js';
import { shouldIncludeFirstPartyOnlyBetas } from './betas.js';
import { isEnvTruthy } from './envUtils.js';
import { getInitialSettings } from './settings/settings.js';
export function isAdvisorBlock(param) {
    return (param.type === 'advisor_tool_result' ||
        (param.type === 'server_tool_use' && param.name === 'advisor'));
}
function getAdvisorConfig() {
    return getFeatureValue_CACHED_MAY_BE_STALE('tengu_sage_compass', {});
}
export function isAdvisorEnabled() {
    if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_ADVISOR_TOOL)) {
        return false;
    }
    // The advisor beta header is first-party only (Bedrock/Vertex 400 on it).
    if (!shouldIncludeFirstPartyOnlyBetas()) {
        return false;
    }
    return getAdvisorConfig().enabled ?? false;
}
export function canUserConfigureAdvisor() {
    return isAdvisorEnabled() && (getAdvisorConfig().canUserConfigure ?? false);
}
export function getExperimentAdvisorModels() {
    const config = getAdvisorConfig();
    return isAdvisorEnabled() &&
        !canUserConfigureAdvisor() &&
        config.baseModel &&
        config.advisorModel
        ? { baseModel: config.baseModel, advisorModel: config.advisorModel }
        : undefined;
}
// @[MODEL LAUNCH]: Add the new model if it supports the advisor tool.
// Checks whether the main loop model supports calling the advisor tool.
export function modelSupportsAdvisor(model) {
    const m = model.toLowerCase();
    return (m.includes('opus-4-6') ||
        m.includes('sonnet-4-6') ||
        process.env.USER_TYPE === 'ant');
}
// @[MODEL LAUNCH]: Add the new model if it can serve as an advisor model.
export function isValidAdvisorModel(model) {
    const m = model.toLowerCase();
    return (m.includes('opus-4-6') ||
        m.includes('sonnet-4-6') ||
        process.env.USER_TYPE === 'ant');
}
export function getInitialAdvisorSetting() {
    if (!isAdvisorEnabled()) {
        return undefined;
    }
    return getInitialSettings().advisorModel;
}
export function getAdvisorUsage(usage) {
    const iterations = usage.iterations;
    if (!iterations) {
        return [];
    }
    return iterations.filter(it => it.type === 'advisor_message');
}
export const ADVISOR_TOOL_INSTRUCTIONS = `# Advisor Tool

You have access to an \`advisor\` tool backed by a stronger reviewer model. It takes NO parameters -- when you call it, your entire conversation history is automatically forwarded. The advisor sees the task, every tool call you've made, every result you've seen.

Call advisor BEFORE substantive work -- before writing code, before committing to an interpretation, before building on an assumption. If the task requires orientation first (finding files, reading code, seeing what's there), do that, then call advisor. Orientation is not substantive work. Writing, editing, and declaring an answer are.

Also call advisor:
- When you believe the task is complete. BEFORE this call, make your deliverable durable: write the file, stage the change, save the result. The advisor call takes time; if the session ends during it, a durable result persists and an unwritten one doesn't.
- When stuck -- errors recurring, approach not converging, results that don't fit.
- When considering a change of approach.

On tasks longer than a few steps, call advisor at least once before committing to an approach and once before declaring done. On short reactive tasks where the next action is dictated by tool output you just read, you don't need to keep calling -- the advisor adds most of its value on the first call, before the approach crystallizes.

Give the advice serious weight. If you follow a step and it fails empirically, or you have primary-source evidence that contradicts a specific claim (the file says X, the code does Y), adapt. A passing self-test is not evidence the advice is wrong -- it's evidence your test doesn't check what the advice is checking.

If you've already retrieved data pointing one way and the advisor points another: don't silently switch. Surface the conflict in one more advisor call -- "I found X, you suggest Y, which constraint breaks the tie?" The advisor saw your evidence but may have underweighted it; a reconcile call is cheaper than committing to the wrong branch.`;
