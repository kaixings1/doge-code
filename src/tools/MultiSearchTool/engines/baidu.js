const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const ENGINE = 'baidu';
export const name = 'baidu';
export const displayName = 'Baidu';
export const needsKey = false;
export function isAvailable() {
    return true;
}
export async function search(query, limit) {
    const results = [];
    try {
        const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&ie=utf-8`;
        const resp = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(15000),
        });
        const html = await resp.text();
        // Extract search result blocks: <div class="result" ...> ... </div>
        const blockRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
        let m;
        while ((m = blockRegex.exec(html)) !== null) {
            if (results.length >= limit)
                break;
            const block = m[1];
            // Title
            const titleMatch = block.match(/<a[^>]*>(.*?)<\/a>/);
            if (!titleMatch)
                continue;
            const title = stripHtml(titleMatch[1]).trim();
            if (!title)
                continue;
            // URL
            const urlMatch = block.match(/href="(https?:\/\/[^"]+)"/);
            const linkUrl = urlMatch ? decodeHtmlEntities(urlMatch[1]) : '';
            // Description
            const descMatch = block.match(/<span[^>]*class="[^"]*content-right_[^"]*"[^>]*>([\s\S]*?)<\/span>/)
                || block.match(/<div[^>]*class="[^"]*c-abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/);
            const description = descMatch ? stripHtml(descMatch[1]).trim() : '';
            results.push({ title, url: linkUrl, description, engine: ENGINE });
        }
        return results.slice(0, limit);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[MultiSearch:Baidu] search failed:', msg);
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
//# sourceMappingURL=baidu.js.map