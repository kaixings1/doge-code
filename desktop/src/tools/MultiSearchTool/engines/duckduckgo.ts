/**
 * DuckDuckGo search engine (no API key required)
 * Uses HTML scraping of html.duckduckgo.com
 */
import type { SearchResultItem } from '../types.js'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const ENGINE = 'duckduckgo'

export const name = 'duckduckgo'
export const displayName = 'DuckDuckGo'
export const needsKey = false
export function isAvailable(): boolean {
  return true
}

export async function search(
  query: string,
  limit: number,
): Promise<SearchResultItem[]> {
  const results: SearchResultItem[] = []
  const seen = new Set<string>()

  try {
    const formData = new URLSearchParams()
    formData.append('q', query)

    const resp = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(15000),
    })

    const html = await resp.text()
    // Parse HTML — extract result__a and result__snippet
    const resultRegex =
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    const snippetRegex =
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]*>[\s\S]*?<\/a>[\s\S]*?<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g

    // Extract title+url pairs
    const linkMatches: { url: string; title: string }[] = []
    let m: RegExpExecArray | null
    while ((m = resultRegex.exec(html)) !== null) {
      const url = decodeHtmlEntities(m[1])
      const title = stripHtml(m[2]).trim()
      if (title && url && !seen.has(url)) {
        seen.add(url)
        linkMatches.push({ url, title })
      }
    }

    // Extract descriptions
    const descs: string[] = []
    while ((m = snippetRegex.exec(html)) !== null) {
      descs.push(stripHtml(m[1]).trim())
    }

    linkMatches.forEach((item, i) => {
      if (results.length >= limit) return
      // Skip ads
      if (item.url.includes('//duckduckgo.com/y.js') || item.url.includes('//duckduckgo.com/l/')) return
      results.push({
        title: item.title,
        url: item.url,
        description: descs[i] || '',
        engine: ENGINE,
      })
    })

    return results.slice(0, limit)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[MultiSearch:DuckDuckGo] search failed:', msg)
    return results
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim()
}
