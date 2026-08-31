/**
 * Build git trailer lines from attribution data for PR squash-merge commit messages.
 *
 * Trailer lines survive squash-merge when configured with PR_BODY as the
 * squash message template.  The generated trailers are appended to the commit
 * body so that per-line authorship is preserved in the final commit.
 */
export function buildPRTrailers(attributionData, _attribution) {
    const trailers = [];
    if (!attributionData || attributionData.version !== 1) {
        return trailers;
    }
    const { summary, excludedGenerated } = attributionData;
    // Only emit trailers when Claude contributed meaningfully.
    if (summary.claudePercent < 5) {
        return trailers;
    }
    // Primary attribution trailer — always present for non-trivial contributions.
    trailers.push(`Co-Authored-By: Claude Code <noreply@anthropic.com> (${summary.claudePercent}% generated)`);
    // Surface breakdown trailers — one per touched surface (src/, tests/, etc.).
    for (const [surface, { claudeChars, percent }] of Object.entries(attributionData.surfaceBreakdown)) {
        if (percent >= 10 && claudeChars > 0) {
            trailers.push(`Co-Authored-By: Claude Code (${percent}% of ${surface}, ${claudeChars} chars)`);
        }
    }
    // Record excluded generated files as informational trailers.
    if (excludedGenerated.length > 0) {
        trailers.push(`Reviewed-by: Claude Code (${excludedGenerated.length} generated files excluded from attribution)`);
    }
    return trailers;
}
