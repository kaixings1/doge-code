import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { isPlainObject } from '../vendor/lodash.js';
import { mapValues } from '../vendor/lodash.js';
import { dirname, join } from 'path';
import { addToTotalSessionCost } from '../cost-tracker.js';
import { calculateUSDCost } from '../utils/modelCost.js';
import { getCwd } from '../utils/cwd.js';
import { env } from '../utils/env.js';
import { getClaudeConfigHomeDir, isEnvTruthy } from '../utils/envUtils.js';
import { getErrnoCode } from '../utils/errors.js';
import { normalizeMessagesForAPI } from '../utils/messages.js';
import { jsonParse, jsonStringify } from '../utils/slowOperations.js';
function shouldUseVCR() {
    if (process.env.NODE_ENV === 'test') {
        return true;
    }
    if (process.env.USER_TYPE === 'ant' && isEnvTruthy(process.env.FORCE_VCR)) {
        return true;
    }
    return false;
}
/**
 * Generic fixture management helper
 * Handles caching, reading, writing fixtures for any data type
 */
async function withFixture(input, fixtureName, f) {
    if (!shouldUseVCR()) {
        return await f();
    }
    // Create hash of input for fixture filename
    const hash = createHash('sha1')
        .update(jsonStringify(input))
        .digest('hex')
        .slice(0, 12);
    const filename = join(process.env.CLAUDE_CODE_TEST_FIXTURES_ROOT ?? getCwd(), `fixtures/${fixtureName}-${hash}.json`);
    // Fetch cached fixture
    try {
        const cached = jsonParse(await readFile(filename, { encoding: 'utf8' }));
        return cached;
    }
    catch (e) {
        const code = getErrnoCode(e);
        if (code !== 'ENOENT') {
            throw e;
        }
    }
    if ((env.isCI || process.env.CI) && !isEnvTruthy(process.env.VCR_RECORD)) {
        throw new Error(`Fixture missing: ${filename}. Re-run tests with VCR_RECORD=1, then commit the result.`);
    }
    // Create & write new fixture
    const result = await f();
    await mkdir(dirname(filename), { recursive: true });
    await writeFile(filename, jsonStringify(result, null, 2), {
        encoding: 'utf8',
    });
    return result;
}
export async function withVCR(messages, f) {
    if (!shouldUseVCR()) {
        return await f();
    }
    const messagesForAPI = normalizeMessagesForAPI(messages.filter(_ => {
        if (_.type !== 'user') {
            return true;
        }
        if (_.isMeta) {
            return false;
        }
        return true;
    }));
    const dehydratedInput = mapMessages(messagesForAPI.map(_ => _.message.content), dehydrateValue);
    const filename = join(process.env.CLAUDE_CODE_TEST_FIXTURES_ROOT ?? getCwd(), `fixtures/${dehydratedInput.map(_ => createHash('sha1').update(jsonStringify(_)).digest('hex').slice(0, 6)).join('-')}.json`);
    // Fetch cached fixture
    try {
        const cached = jsonParse(await readFile(filename, { encoding: 'utf8' }));
        cached.output.forEach(addCachedCostToTotalSessionCost);
        return cached.output.map((message, index) => mapMessage(message, hydrateValue, index, randomUUID()));
    }
    catch (e) {
        const code = getErrnoCode(e);
        if (code !== 'ENOENT') {
            throw e;
        }
    }
    if (env.isCI && !isEnvTruthy(process.env.VCR_RECORD)) {
        throw new Error(`Anthropic API fixture missing: ${filename}. Re-run tests with VCR_RECORD=1, then commit the result. Input messages:\n${jsonStringify(dehydratedInput, null, 2)}`);
    }
    // Create & write new fixture
    const results = await f();
    if (env.isCI && !isEnvTruthy(process.env.VCR_RECORD)) {
        return results;
    }
    await mkdir(dirname(filename), { recursive: true });
    await writeFile(filename, jsonStringify({
        input: dehydratedInput,
        output: results.map((message, index) => mapMessage(message, dehydrateValue, index)),
    }, null, 2), { encoding: 'utf8' });
    return results;
}
function addCachedCostToTotalSessionCost(message) {
    if (message.type === 'stream_event') {
        return;
    }
    const model = message.message.model;
    const usage = message.message.usage;
    // Guard against undefined usage from non-standard API responses
    if (!usage) {
        return;
    }
    const costUSD = calculateUSDCost(model, usage);
    addToTotalSessionCost(costUSD, usage, model);
}
function mapMessages(messages, f) {
    return messages.map(_ => {
        if (typeof _ === 'string') {
            return f(_);
        }
        return _.map(_ => {
            switch (_.type) {
                case 'tool_result':
                    if (typeof _.content === 'string') {
                        return { ..._, content: f(_.content) };
                    }
                    if (Array.isArray(_.content)) {
                        return {
                            ..._,
                            content: _.content.map(_ => {
                                switch (_.type) {
                                    case 'text':
                                        return { ..._, text: f(_.text) };
                                    case 'image':
                                        return _;
                                    default:
                                        return undefined;
                                }
                            }),
                        };
                    }
                    return _;
                case 'text':
                    return { ..._, text: f(_.text) };
                case 'tool_use':
                    return {
                        ..._,
                        input: mapValuesDeep(_.input, f),
                    };
                case 'image':
                    return _;
                default:
                    return undefined;
            }
        });
    });
}
function mapValuesDeep(obj, f) {
    return mapValues(obj, (val, key) => {
        if (Array.isArray(val)) {
            return val.map(_ => mapValuesDeep(_, f));
        }
        if (isPlainObject(val)) {
            return mapValuesDeep(val, f);
        }
        return f(val, key, obj);
    });
}
function mapAssistantMessage(message, f, index, uuid) {
    return {
        // Use provided UUID if given (hydrate path uses randomUUID for globally unique IDs),
        // otherwise fall back to deterministic index-based UUID (dehydrate/fixture path).
        // sessionStorage.ts deduplicates messages by UUID, so without unique UUIDs across
        // VCR calls, resumed sessions would treat different responses as duplicates.
        uuid: uuid ?? `UUID-${index}`,
        requestId: 'REQUEST_ID',
        timestamp: message.timestamp,
        message: {
            ...message.message,
            content: message.message.content
                .map(_ => {
                switch (_.type) {
                    case 'text':
                        return {
                            ..._,
                            text: f(_.text),
                            citations: _.citations || [],
                        }; // Ensure citations
                    case 'tool_use':
                        return {
                            ..._,
                            input: mapValuesDeep(_.input, f),
                        };
                    default:
                        return _; // Handle other block types unchanged
                }
            })
                .filter(Boolean),
        },
        type: 'assistant',
    };
}
function mapMessage(message, f, index, uuid) {
    if (message.type === 'assistant') {
        return mapAssistantMessage(message, f, index, uuid);
    }
    else {
        return message;
    }
}
function dehydrateValue(s) {
    if (typeof s !== 'string') {
        return s;
    }
    const cwd = getCwd();
    const configHome = getClaudeConfigHomeDir();
    let s1 = s
        .replace(/num_files="\d+"/g, 'num_files="[NUM]"')
        .replace(/duration_ms="\d+"/g, 'duration_ms="[DURATION]"')
        .replace(/cost_usd="\d+"/g, 'cost_usd="[COST]"')
        // Note: We intentionally don't replace all forward slashes with path.sep here.
        // That would corrupt XML-like tags (e.g., </system-reminder> -> <\system-reminder>).
        // The [CONFIG_HOME] and [CWD] replacements below handle path normalization.
        .replaceAll(configHome, '[CONFIG_HOME]')
        .replaceAll(cwd, '[CWD]')
        .replace(/Available commands:.+/, 'Available commands: [COMMANDS]');
    // On Windows, paths may appear in multiple forms:
    // 1. Forward-slash variants (Git, some Node APIs)
    // 2. JSON-escaped variants (backslashes doubled in serialized JSON within messages)
    if (process.platform === 'win32') {
        const cwdFwd = cwd.replaceAll('\\', '/');
        const configHomeFwd = configHome.replaceAll('\\', '/');
        // jsonStringify escapes \ to \\ - match paths embedded in JSON strings
        const cwdJsonEscaped = jsonStringify(cwd).slice(1, -1);
        const configHomeJsonEscaped = jsonStringify(configHome).slice(1, -1);
        s1 = s1
            .replaceAll(cwdJsonEscaped, '[CWD]')
            .replaceAll(configHomeJsonEscaped, '[CONFIG_HOME]')
            .replaceAll(cwdFwd, '[CWD]')
            .replaceAll(configHomeFwd, '[CONFIG_HOME]');
    }
    // Normalize backslash path separators after placeholders so VCR fixture
    // hashes match across platforms (e.g., [CWD]\foo\bar -> [CWD]/foo/bar)
    // Handle both single backslashes and JSON-escaped double backslashes (\\)
    s1 = s1
        .replace(/\[CWD\][^\s"'<>]*/g, match => match.replaceAll('\\\\', '/').replaceAll('\\', '/'))
        .replace(/\[CONFIG_HOME\][^\s"'<>]*/g, match => match.replaceAll('\\\\', '/').replaceAll('\\', '/'));
    if (s1.includes('Files modified by user:')) {
        return 'Files modified by user: [FILES]';
    }
    return s1;
}
function hydrateValue(s) {
    if (typeof s !== 'string') {
        return s;
    }
    return s
        .replaceAll('[NUM]', '1')
        .replaceAll('[DURATION]', '100')
        .replaceAll('[CONFIG_HOME]', getClaudeConfigHomeDir())
        .replaceAll('[CWD]', getCwd());
}
export async function* withStreamingVCR(messages, f) {
    if (!shouldUseVCR()) {
        return yield* f();
    }
    // Compute and yield messages
    const buffer = [];
    // Record messages (or fetch from cache)
    const cachedBuffer = await withVCR(messages, async () => {
        for await (const message of f()) {
            buffer.push(message);
        }
        return buffer;
    });
    if (cachedBuffer.length > 0) {
        yield* cachedBuffer;
        return;
    }
    yield* buffer;
}
export async function withTokenCountVCR(messages, tools, f) {
    // Dehydrate before hashing so fixture keys survive cwd/config-home/tempdir
    // variation and message UUID/timestamp churn. System prompts embed the
    // working directory (both raw and as a slash→dash project slug in the
    // auto-memory path) and messages carry fresh UUIDs per run; without this,
    // every test run produces a new hash and fixtures never hit in CI.
    const cwdSlug = getCwd().replace(/[^a-zA-Z0-9]/g, '-');
    const dehydrated = dehydrateValue(jsonStringify({ messages, tools }))
        .replaceAll(cwdSlug, '[CWD_SLUG]')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[UUID]')
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '[TIMESTAMP]');
    const result = await withFixture(dehydrated, 'token-count', async () => ({
        tokenCount: await f(),
    }));
    return result.tokenCount;
}
//# sourceMappingURL=vcr.js.map