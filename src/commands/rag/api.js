import fs from 'fs';
import path from 'path';
const DATA_FILE = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.doge-rag-index.json');
function loadIndex() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        }
    }
    catch { }
    return [];
}
function saveIndex(entries) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}
export const ragApi = {
    async indexFolder(folderPath) {
        const absPath = path.resolve(folderPath);
        if (!fs.existsSync(absPath))
            return 'Folder not found: ' + absPath;
        const entries = [];
        const extSet = new Set([
            '.ts', '.tsx', '.js', '.jsx', '.md', '.txt',
            '.json', '.yaml', '.yml', '.css', '.html',
            '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h'
        ]);
        function walk(dir) {
            try {
                const items = fs.readdirSync(dir, { withFileTypes: true });
                for (const item of items) {
                    const full = path.join(dir, item.name);
                    if (item.isDirectory()) {
                        if (!item.name.startsWith('.') && item.name !== 'node_modules' && item.name !== 'dist' && item.name !== 'build') {
                            walk(full);
                        }
                    }
                    else if (extSet.has(path.extname(item.name))) {
                        try {
                            const content = fs.readFileSync(full, 'utf-8').slice(0, 50000);
                            if (content.trim()) {
                                entries.push({
                                    file: full,
                                    content,
                                    indexedAt: new Date().toISOString(),
                                });
                            }
                        }
                        catch { }
                    }
                }
            }
            catch { }
        }
        walk(absPath);
        saveIndex(entries);
        return 'Indexed ' + entries.length + ' files from ' + absPath + '\nSaved to: ' + DATA_FILE;
    },
    async query(searchText) {
        const entries = loadIndex();
        if (entries.length === 0)
            return 'No indexed files. Use /rag add first.';
        const lowerQuery = searchText.toLowerCase();
        const words = lowerQuery.split(/\s+/).filter(Boolean);
        const scored = entries
            .map((e) => ({
            ...e,
            score: words.filter((w) => e.content.toLowerCase().includes(w)).length,
        }))
            .filter((e) => e.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
        if (scored.length === 0)
            return 'No results for: ' + searchText;
        const lines = ['Results for: ' + searchText, ''];
        for (const item of scored) {
            const idx = item.content.toLowerCase().indexOf(lowerQuery.slice(0, 20));
            const start = Math.max(0, idx - 100);
            const end = Math.min(item.content.length, idx + 200);
            const snippet = idx >= 0
                ? '...' + item.content.slice(start, end) + '...'
                : item.content.slice(0, 200);
            lines.push('File: ' + item.file);
            lines.push('Keywords matched: ' + item.score);
            lines.push(snippet.replace(/\n/g, ' ').slice(0, 300));
            lines.push('');
        }
        return lines.join('\n');
    },
    async listIndexed() {
        const entries = loadIndex();
        if (entries.length === 0)
            return 'No indexed files.';
        const groups = {};
        for (const e of entries) {
            const dir = path.dirname(e.file);
            groups[dir] = (groups[dir] || 0) + 1;
        }
        const lines = ['Total indexed files: ' + entries.length, ''];
        for (const [dir, count] of Object.entries(groups).sort()) {
            lines.push(dir + ' (' + count + ' files)');
        }
        return lines.join('\n');
    },
    async clearIndex() {
        saveIndex([]);
        return 'Knowledge base cleared.';
    },
};
