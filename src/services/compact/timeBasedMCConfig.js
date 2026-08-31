import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js';
const TIME_BASED_MC_CONFIG_DEFAULTS = {
    enabled: false,
    gapThresholdMinutes: 60,
    keepRecent: 5,
};
export function getTimeBasedMCConfig() {
    // Hoist the GB read so exposure fires on every eval path, not just when
    // the caller's other conditions (querySource, messages.length) pass.
    return getFeatureValue_CACHED_MAY_BE_STALE('tengu_slate_heron', TIME_BASED_MC_CONFIG_DEFAULTS);
}
