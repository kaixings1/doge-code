import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js';
import { isEnvTruthy } from './envUtils.js';
/**
 * Check if --agent-teams flag is provided via CLI.
 * Checks process.argv directly to avoid import cycles with bootstrap/state.
 * Note: The flag is only shown in help for ant users, but if external users
 * pass it anyway, it will work (subject to the killswitch).
 */
function isAgentTeamsFlagSet() {
    return process.argv.includes('--agent-teams');
}
// Guard against recursion during tool isEnabled() checks.
// The following chain can cause infinite recursion:
//   getAllBaseTools() → isAgentSwarmsEnabled() → getFeatureValue_CACHED_MAY_BE_STALE()
//     → getGlobalConfig() → [context initialization] → getAllBaseTools() → ...
// We use two guards:
//   1. inProgress flag: prevents re-entry during the same call stack
//   2. cached result: returns immediately on subsequent calls
let cachedAgentSwarmsEnabled = null;
let isAgentSwarmsInProgress = false;
/**
 * Centralized runtime check for agent teams/teammate features.
 * This is the single gate that should be checked everywhere teammates
 * are referenced (prompts, code, tools isEnabled, UI, etc.).
 *
 * Ant builds: always enabled.
 * External builds require both:
 * 1. Opt-in via CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env var OR --agent-teams flag
 * 2. GrowthBook gate 'tengu_amber_flint' enabled (killswitch)
 */
export function isAgentSwarmsEnabled() {
    // Return cached result immediately to prevent recursive GrowthBook calls
    if (cachedAgentSwarmsEnabled !== null) {
        return cachedAgentSwarmsEnabled;
    }
    // Guard against re-entry during tool initialization
    if (isAgentSwarmsInProgress) {
        return false;
    }
    isAgentSwarmsInProgress = true;
    try {
        // Ant: always on
        if (process.env.USER_TYPE === 'ant') {
            cachedAgentSwarmsEnabled = true;
            return true;
        }
        // External: require opt-in via env var or --agent-teams flag
        if (!isEnvTruthy(process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS) &&
            !isAgentTeamsFlagSet()) {
            cachedAgentSwarmsEnabled = false;
            return false;
        }
        // Set cache to false BEFORE calling getFeatureValue_CACHED_MAY_BE_STALE
        // to prevent infinite recursion: getFeatureValue → refreshGrowthBookAfterAuthChange
        // → refreshPolicyLimits → isAgentSwarmsEnabled (recursive)
        cachedAgentSwarmsEnabled = false;
        const featureValue = getFeatureValue_CACHED_MAY_BE_STALE('tengu_amber_flint', true);
        if (!featureValue) {
            cachedAgentSwarmsEnabled = false;
            return false;
        }
        cachedAgentSwarmsEnabled = true;
        return true;
    }
    finally {
        // Always reset inProgress guard, even on errors or re-entrance detection
        isAgentSwarmsInProgress = false;
    }
}
