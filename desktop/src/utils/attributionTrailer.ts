import type { AttributionData } from './commitAttribution.js'

export function buildPRTrailers(
  attributionData: AttributionData,
  _attribution: any,
): string[] {
  const trailers: string[] = []

  if (!attributionData || attributionData.version !== 1) {
    return trailers
  }

  const { summary, excludedGenerated } = attributionData

  if (summary.claudePercent < 5) {
    return trailers
  }

  trailers.push(
    `Co-Authored-By: Claude Code <noreply@anthropic.com> (${summary.claudePercent}% generated)`,
  )

  for (const [surface, { claudeChars, percent }] of Object.entries(
    attributionData.surfaceBreakdown,
  )) {
    if (percent >= 10 && claudeChars > 0) {
      trailers.push(
        `Co-Authored-By: Claude Code (${percent}% of ${surface}, ${claudeChars} chars)`,
      )
    }
  }

  if (excludedGenerated.length > 0) {
    trailers.push(
      `Reviewed-by: Claude Code (${excludedGenerated.length} generated files excluded from attribution)`,
    )
  }

  return trailers
}
