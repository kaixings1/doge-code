/**
 * Terminal hyperlink formatting (OSC 8)
 *
 * Formats clickable links for modern terminals that support
 * the OSC 8 escape sequence. Falls back to plain text when the
 * terminal does not support it.
 *
 * Usage:
 *   formatTerminalLink('Click here', 'https://example.com')
 *   // => '\u001b]8;;https://example.com\u0007Click here\u001b]8;;\u0007'
 *
 * Inspired by OpenClaw's terminal-core/terminal-link.ts.
 */

/**
 * Format a clickable terminal link. Falls back to "label (url)" if not a TTY.
 */
export function formatTerminalLink(
  label: string,
  url: string,
  opts?: { fallback?: string; force?: boolean },
): string {
  const safeLabel = label.replace(/\x1b/g, '')
  const safeUrl = url.replace(/\x1b/g, '')

  const allow = opts?.force === true
    ? true
    : opts?.force === false
      ? false
      : process.stdout.isTTY

  if (!allow) {
    return opts?.fallback ?? safeLabel + ' (' + safeUrl + ')'
  }

  // OSC 8: \x1b]8;;<url>\x07<label>\x1b]8;;\x07
  return '\x1b]8;;' + safeUrl + '\x07' + safeLabel + '\x1b]8;;\x07'
}
