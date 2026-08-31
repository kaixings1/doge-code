import { logForDebugging } from '../utils/debug.js';
import fs from 'fs/promises';
import path from 'path';
const KEYWORD_MAP = {
    code: ['write', 'implement', 'create', 'build', 'add', 'generate', 'function', 'class', 'api'],
    research: ['find', 'search', 'look up', 'investigate', 'explain', 'what is', 'how does'],
    planning: ['plan', 'design', 'architect', 'roadmap', 'strategy', 'outline', 'propose'],
    debug: ['fix', 'bug', 'error', 'broken', 'crash', 'debug', 'troubleshoot', 'issue'],
    refactor: ['refactor', 'clean up', 'improve', 'optimize', 'restructure', 'simplify'],
    document: ['document', 'readme', 'comment', 'doc', 'guide', 'tutorial', 'explain'],
    data: ['analyze', 'data', 'csv', 'sql', 'query', 'visualize', 'chart', 'statistics'],
    general: [],
};
const TEMPLATE_MAP = {
    code: 'code-generation',
    research: 'research-deep-dive',
    planning: 'planning-session',
    debug: 'debug-investigation',
    refactor: 'refactoring',
    document: 'documentation',
    data: 'data-analysis',
    general: 'general-assist',
};
/**
 * Classify a user query into a category and suggest a workflow template.
 *
 * Uses lightweight keyword scoring - no external API calls.
 *
 * @param query - The user's query string (or any context object with a
 *                query/message/prompt field).
 * @returns A ClassifierResult with category, confidence, and tags.
 */
export async function runClassifier(query) {
    try {
        const text = typeof query === 'string'
            ? query
            : query?.query ?? query?.message ?? query?.prompt ?? '';
        if (!text || text.trim().length === 0) {
            logForDebugging('runClassifier: empty query, returning general');
            return {
                category: 'general',
                confidence: 0.3,
                tags: [],
                template: TEMPLATE_MAP.general,
            };
        }
        const lower = text.toLowerCase();
        const scores = {
            code: 0,
            research: 0,
            planning: 0,
            debug: 0,
            refactor: 0,
            document: 0,
            data: 0,
            general: 0,
        };
        // Score each category by keyword matches.
        for (const [category, keywords] of Object.entries(KEYWORD_MAP)) {
            for (const kw of keywords) {
                if (lower.includes(kw)) {
                    scores[category] += 1;
                }
            }
        }
        // Find the best-scoring category.
        let bestCategory = 'general';
        let bestScore = 0;
        for (const [category, score] of Object.entries(scores)) {
            if (score > bestScore) {
                bestScore = score;
                bestCategory = category;
            }
        }
        // Confidence: ratio of best score to total keyword count (capped at 1.0).
        const totalMatches = Object.values(scores).reduce((a, b) => a + b, 0);
        const confidence = totalMatches === 0 ? 0.3 : Math.min(bestScore / totalMatches, 1.0);
        // Extract matched keywords as tags.
        const tags = [];
        for (const kw of KEYWORD_MAP[bestCategory]) {
            if (lower.includes(kw)) {
                tags.push(kw);
            }
        }
        logForDebugging(`runClassifier: category=${bestCategory}, confidence=${confidence.toFixed(2)}, tags=${JSON.stringify(tags)}`);
        return {
            category: bestCategory,
            confidence,
            tags,
            template: TEMPLATE_MAP[bestCategory],
        };
    }
    catch (error) {
        logForDebugging(`runClassifier: failed - ${error instanceof Error ? error.message : String(error)}`);
        return {
            category: 'general',
            confidence: 0,
            tags: [],
            template: 'general-assist',
        };
    }
}
/**
 * Classify assistant messages and write the results to a state file.
 *
 * Called by stopHooks after each query loop iteration to persist
 * classification data for the job.
 *
 * @param jobDir - Directory where classification state files are stored.
 * @param messages - Assistant messages from the current turn.
 */
export async function classifyAndWriteState(jobDir, messages) {
    try {
        if (!jobDir || jobDir.trim().length === 0) {
            logForDebugging('classifyAndWriteState: no job dir, skipping');
            return;
        }
        const results = [];
        for (const msg of messages) {
            const text = extractText(msg);
            if (!text)
                continue;
            const result = await runClassifier(text);
            if (result) {
                results.push(result);
            }
        }
        const stateFile = path.join(jobDir, 'classification-state.json');
        await fs.mkdir(jobDir, { recursive: true });
        await fs.writeFile(stateFile, JSON.stringify({
            timestamp: new Date().toISOString(),
            messageCount: results.length,
            results,
        }, null, 2));
        logForDebugging(`classifyAndWriteState: wrote ${results.length} results to ${stateFile}`);
    }
    catch (error) {
        logForDebugging(`classifyAndWriteState: failed - ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Extract text content from an assistant message object.
 */
function extractText(msg) {
    if (!msg || !msg.message)
        return null;
    const content = msg.message.content;
    if (typeof content === 'string')
        return content;
    if (Array.isArray(content)) {
        return content
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('');
    }
    return null;
}
