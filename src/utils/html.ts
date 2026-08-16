/**
 * HTML detection and cleaning utilities.
 * Adapted from aider/scrape.py — lightweight, zero-dependency helpers
 * for detecting HTML content and stripping unnecessary markup.
 */

const HTML_PATTERNS = [
  /<!DOCTYPE\s+html/i,
  /<html/i,
  /<head/i,
  /<body/i,
  /<div/i,
  /<p>/i,
  /<a\s+href=/i,
] as const

/**
 * Heuristically determines whether `content` is HTML.
 * Checks for common HTML tags and DOCTYPE declarations.
 *
 * @example
 * looksLikeHtml('<html><body>hi</body></html>') // true
 * looksLikeHtml('just plain text')              // false
 */
export function looksLikeHtml(content: string): boolean {
  return HTML_PATTERNS.some((pattern) => pattern.test(content))
}

/**
 * Strips unnecessary markup from an HTML string to produce a lightweight
 * representation suitable for diffing or further markdown conversion.
 *
 * Removes:
 * - `<svg>` elements (typically heavy and irrelevant)
 * - `<img>` elements
 * - Elements with `href` or `src` starting with `data:` (data URIs)
 * - All element attributes except `href`
 *
 * @param html - Raw HTML string
 * @returns Cleaned HTML string
 */
export function slimdownHtml(html: string): string {
  let result = html

  // Remove <svg>...</svg> blocks
  result = result.replace(/<svg[\s\S]*?<\/svg>/gi, "")

  // Remove <img ...> tags (self-closing or with closing tag)
  result = result.replace(/<img\b[^>]*>/gi, "")

  // Remove elements with data: URIs in href or src
  result = result.replace(
    /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\b(href|src)=["']data:[^"']*["'][^>]*>/gi,
    "<$1>",
  )

  // Strip all attributes except href
  result = result.replace(
    /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)>/g,
    (match, tag, attrs) => {
      // Keep only href attributes
      const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i)
      if (hrefMatch) {
        return `<${tag} ${hrefMatch[0]}>`
      }
      return `<${tag}>`
    },
  )

  return result
}
