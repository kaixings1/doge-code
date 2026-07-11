const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const ENGINE = 'bing';
export const name = 'bing';
export const displayName = 'Bing';
export const needsKey = false;
export function isAvailable() {
    return true;
}
export async function search(query, limit) {
    const results = [];
    try {
        const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
        const resp = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(15000),
        });
        const html = await resp.text();
        // Bing results: <li class="b_algo"> ... </li>
        const blockRegex = /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
        let m;
        while ((m = blockRegex.exec(html)) !== null) {
            if (results.length >= limit)
                break;
            const block = m[1];
            const titleMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
            if (!titleMatch)
                continue;
            const linkUrl = decodeHtmlEntities(titleMatch[1]);
            const title = stripHtml(titleMatch[2]).trim();
            if (!title || !linkUrl)
                continue;
            const descMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
            const description = descMatch ? stripHtml(descMatch[1]).trim() : '';
            results.push({ title, url: linkUrl, description, engine: ENGINE });
        }
        return results.slice(0, limit);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[MultiSearch:Bing] search failed:', msg);
        return results;
    }
}
function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/');
}
function stripHtml(text) {
    return text.replace(/<[^>]*>/g, '').trim();
}
