import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js';
/**
 * Runtime gate for /ultrareview. GB config's `enabled` field controls
 * visibility — isEnabled() on the command filters it from getCommands()
 * when false, so ungated users don't see the command at all.
 */
export function isUltrareviewEnabled() {
    const cfg = getFeatureValue_CACHED_MAY_BE_STALE('tengu_review_bughunter_config', null);
    return cfg?.enabled === true;
}
