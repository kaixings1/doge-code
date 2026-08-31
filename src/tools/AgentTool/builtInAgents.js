import { feature } from 'bun:bundle';
import { getIsNonInteractiveSession } from '../../bootstrap/state.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import { CLAUDE_CODE_GUIDE_AGENT } from './built-in/claudeCodeGuideAgent.js';
import { EXPLORE_AGENT } from './built-in/exploreAgent.js';
import { GENERAL_PURPOSE_AGENT } from './built-in/generalPurposeAgent.js';
import { MANUS_AGENT } from './built-in/manusAgent.js';
import { SWE_AGENT } from './built-in/sweAgent.js';
import { BROWSER_AGENT } from './built-in/browserAgent.js';
import { SANDBOX_AGENT } from './built-in/sandboxAgent.js';
import { PLAN_AGENT } from './built-in/planAgent.js';
import { STATUSLINE_SETUP_AGENT } from './built-in/statuslineSetup.js';
import { VERIFICATION_AGENT } from './built-in/verificationAgent.js';
import { TEAM_LEADER_AGENT } from './built-in/teamLeaderAgent.js';
import { PM_AGENT } from './built-in/pmAgent.js';
import { ENGINEER_AGENT } from './built-in/engineerAgent.js';
import { ARCHITECT_AGENT } from './built-in/architectAgent.js';
import { QA_AGENT } from './built-in/qaAgent.js';
import { CODE_REVIEWER_AGENT } from './built-in/codeReviewerAgent.js';
import { RESEARCHER_AGENT } from './built-in/researcherAgent.js';
export function areExplorePlanAgentsEnabled() {
    if (feature('BUILTIN_EXPLORE_PLAN_AGENTS')) {
        // 第三方默认值: true — Bedrock/Vertex 保持代理启用（匹配实验前的外部行为）。A/B 测试实验组设为 false 以衡量移除的影响。
        return getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_stoat', true);
    }
    return false;
}
export function getBuiltInAgents() {
    // 允许通过环境变量禁用所有内置代理（适用于希望白手起家的 SDK 用户）
    // 仅在非交互模式下生效（SDK/API 使用场景）
    if (isEnvTruthy(process.env.CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS) &&
        getIsNonInteractiveSession()) {
        return [];
    }
    // 在函数体内使用懒加载 require 以避免模块初始化时的循环依赖问题。
    // coordinatorMode 模块依赖 tools，tools 依赖 AgentTool，AgentTool 又导入此文件。
    if (feature('COORDINATOR_MODE')) {
        if (isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)) {
            const { getCoordinatorAgents } = require('../../coordinator/workerAgent.js');
            return getCoordinatorAgents();
        }
    }
    const agents = [
        MANUS_AGENT,
        GENERAL_PURPOSE_AGENT,
        STATUSLINE_SETUP_AGENT,
        SWE_AGENT,
        BROWSER_AGENT,
        SANDBOX_AGENT,
        TEAM_LEADER_AGENT,
        PM_AGENT,
        ARCHITECT_AGENT,
        ENGINEER_AGENT,
        QA_AGENT,
        CODE_REVIEWER_AGENT,
        RESEARCHER_AGENT,
    ];
    if (areExplorePlanAgentsEnabled()) {
        agents.push(EXPLORE_AGENT, PLAN_AGENT);
    }
    // 为非 SDK 入口点包含 Code Guide 代理
    const isNonSdkEntrypoint = process.env.CLAUDE_CODE_ENTRYPOINT !== 'sdk-ts' &&
        process.env.CLAUDE_CODE_ENTRYPOINT !== 'sdk-py' &&
        process.env.CLAUDE_CODE_ENTRYPOINT !== 'sdk-cli';
    if (isNonSdkEntrypoint) {
        agents.push(CLAUDE_CODE_GUIDE_AGENT);
    }
    if (feature('VERIFICATION_AGENT') &&
        getFeatureValue_CACHED_MAY_BE_STALE('tengu_hive_evidence', false)) {
        agents.push(VERIFICATION_AGENT);
    }
    return agents;
}
