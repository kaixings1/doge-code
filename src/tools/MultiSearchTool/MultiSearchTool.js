import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { logForDebugging } from '../../utils/debug.js';
import { getLocalMonthYear } from '../../constants/common.js';
import engines, { getAvailableEngines, getEngine } from './engines/index.js';
export const MULTI_SEARCH_TOOL_NAME = 'MultiSearch';
function getMultiSearchPrompt() {
    const currentMonthYear = getLocalMonthYear();
    const engineList = engines
        .map((e) => '  - ' + e.displayName + (e.needsKey ? ' (needs ' + (e.envKey || 'API key') + ')' : ' (no key needed)'))
        .join('\n');
    return ('- MultiSearch: 搜索网页，**不需要 API Key**（使用 DuckDuckGo/Baidu/Bing 等免费引擎）\n' +
        '- 支持指定搜索引擎（engine 参数），省略则自动使用所有可用引擎并合并结果\n' +
        '- 返回格式化的搜索结果，包含标题、URL 和摘要\n' +
        '- 用于获取最新信息或 Claude 知识截止日期之后的信息\n' +
        '- 回答用户问题后，必须在末尾包含"信息来源："部分，列出所有相关 URL\n' +
        '- 当前月份为 ' +
        currentMonthYear +
        '，搜索时使用当前年份\n' +
        '\n可用引擎：\n' +
        engineList);
}
const inputSchema = lazySchema(() => z.strictObject({
    query: z.string().min(1).describe('搜索查询词'),
    engine: z
        .string()
        .optional()
        .describe('搜索引擎：duckduckgo、baidu、bing。省略则自动选择。'),
    limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe('最大结果数（1-20，默认 5）'),
}));
const outputSchema = lazySchema(() => z.object({
    query: z.string(),
    engine: z.string(),
    results: z.array(z.object({
        title: z.string(),
        url: z.string(),
        description: z.string(),
        engine: z.string(),
    })),
    durationMs: z.number(),
}));
async function searchEngine(engineName, query, limit) {
    const engine = getEngine(engineName);
    if (!engine) {
        logForDebugging('[MultiSearch] unknown engine: ' + engineName + ', falling back to duckduckgo');
        const fb = getEngine('duckduckgo');
        return fb ? fb.search(query, limit) : [];
    }
    return engine.search(query, limit);
}
async function searchAll(query, limit) {
    const available = getAvailableEngines();
    if (available.length === 0)
        return [];
    const perEngine = Math.max(1, Math.ceil(limit / available.length));
    const allResults = await Promise.all(available.map((e) => e.search(query, perEngine)));
    const seen = new Set();
    const merged = [];
    for (const batch of allResults) {
        for (const item of batch) {
            if (!seen.has(item.url)) {
                seen.add(item.url);
                merged.push(item);
            }
        }
    }
    return merged.slice(0, limit);
}
export const MultiSearchTool = buildTool({
    name: MULTI_SEARCH_TOOL_NAME,
    searchHint: '搜索多个网络搜索引擎（无需 API Key）',
    maxResultSizeChars: 50_000,
    shouldDefer: true,
    isEnabled: () => true,
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    async description(input) {
        return '搜索网络：' + input.query;
    },
    userFacingName: () => 'Multi-Search',
    getToolUseSummary(input) {
        return 'searching for "' + input.query + '"';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    async validateInput(input) {
        if (!input.query || input.query.trim().length === 0) {
            return { result: false, message: '需要提供搜索查询', errorCode: 1 };
        }
        return { result: true };
    },
    async call(input, _context, _canUseTool, _parentMessage, onProgress) {
        const startTime = performance.now();
        const query = input.query;
        const engineName = input.engine || 'auto';
        const limit = input.limit || 5;
        if (onProgress) {
            onProgress({
                toolUseID: 'multi-search-start',
                data: {
                    type: 'progress',
                    message: 'Searching ' +
                        (engineName === 'auto' ? 'multiple engines' : engineName) +
                        ' for: ' +
                        query,
                },
            });
        }
        let results;
        if (engineName === 'auto') {
            results = await searchAll(query, limit);
        }
        else {
            results = await searchEngine(engineName, query, limit);
        }
        const durationMs = Math.round(performance.now() - startTime);
        return {
            data: {
                query,
                engine: engineName,
                results,
                durationMs,
            },
        };
    },
    async prompt() {
        return getMultiSearchPrompt();
    },
});
//# sourceMappingURL=MultiSearchTool.js.map