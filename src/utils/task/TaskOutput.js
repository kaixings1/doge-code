var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _TaskOutput_instances, _a, _TaskOutput_stdoutBuffer, _TaskOutput_stderrBuffer, _TaskOutput_disk, _TaskOutput_recentLines, _TaskOutput_totalLines, _TaskOutput_totalBytes, _TaskOutput_maxMemory, _TaskOutput_onProgress, _TaskOutput_outputFileRedundant, _TaskOutput_outputFileSize, _TaskOutput_registry, _TaskOutput_activePolling, _TaskOutput_pollInterval, _TaskOutput_tick, _TaskOutput_writeBuffered, _TaskOutput_updateProgress, _TaskOutput_spillToDisk, _TaskOutput_readStdoutFromFile;
import { unlink } from 'fs/promises';
import { CircularBuffer } from '../CircularBuffer.js';
import { logForDebugging } from '../debug.js';
import { readFileRange, tailFile } from '../fsOperations.js';
import { getMaxOutputLength } from '../shell/outputLimits.js';
import { safeJoinLines } from '../stringUtils.js';
import { DiskTaskOutput, getTaskOutputPath } from './diskOutput.js';
const DEFAULT_MAX_MEMORY = 8 * 1024 * 1024; // 8MB
const POLL_INTERVAL_MS = 1000;
const PROGRESS_TAIL_BYTES = 4096;
/**
 * 命令输出的单一数据源。
 *
 * 对于bash命令（文件模式）：stdout和stderr直接写入文件，
 * 不经过JS处理。进度通过轮询文件尾部获取。getStderr()返回空字符串，
 * 因为stderr与输出文件内容交错。
 *
 * 对于钩子（管道模式）：数据通过writeStdout()/writeStderr()
 * 写入内存缓冲区，超出限制时会溢出到磁盘。
 */
export class TaskOutput {
    constructor(taskId, onProgress, stdoutToFile = false, maxMemory = DEFAULT_MAX_MEMORY) {
        _TaskOutput_instances.add(this);
        _TaskOutput_stdoutBuffer.set(this, '');
        _TaskOutput_stderrBuffer.set(this, '');
        _TaskOutput_disk.set(this, null);
        _TaskOutput_recentLines.set(this, new CircularBuffer(1000));
        _TaskOutput_totalLines.set(this, 0);
        _TaskOutput_totalBytes.set(this, 0);
        _TaskOutput_maxMemory.set(this, void 0);
        _TaskOutput_onProgress.set(this, void 0);
        /** Set by getStdout() — true when the file was fully read (≤ maxOutputLength). */
        _TaskOutput_outputFileRedundant.set(this, false
        /** Set by getStdout() — total file size in bytes. */
        );
        /** Set by getStdout() — total file size in bytes. */
        _TaskOutput_outputFileSize.set(this, 0
        // --- Shared poller state ---
        /** Registry of all file-mode TaskOutput instances with onProgress callbacks. */
        );
        this.taskId = taskId;
        this.path = getTaskOutputPath(taskId);
        this.stdoutToFile = stdoutToFile;
        __classPrivateFieldSet(this, _TaskOutput_maxMemory, maxMemory, "f");
        __classPrivateFieldSet(this, _TaskOutput_onProgress, onProgress, "f");
        // 当stdout写入文件且需要进度时注册轮询
        // 实际轮询由React通过startPolling/stopPolling启动/停止
        if (stdoutToFile && onProgress) {
            __classPrivateFieldGet(_a, _a, "f", _TaskOutput_registry).set(taskId, this);
        }
    }
    /**
     * 开始轮询输出文件以获取进度。当进度组件挂载时，由React的useEffect调用。
     */
    static startPolling(taskId) {
        const instance = __classPrivateFieldGet(_a, _a, "f", _TaskOutput_registry).get(taskId);
        if (!instance || !__classPrivateFieldGet(instance, _TaskOutput_onProgress, "f")) {
            return;
        }
        __classPrivateFieldGet(_a, _a, "f", _TaskOutput_activePolling).set(taskId, instance);
        if (!__classPrivateFieldGet(_a, _a, "f", _TaskOutput_pollInterval)) {
            __classPrivateFieldSet(_a, _a, setInterval(__classPrivateFieldGet(_a, _a, "m", _TaskOutput_tick), POLL_INTERVAL_MS), "f", _TaskOutput_pollInterval);
            __classPrivateFieldGet(_a, _a, "f", _TaskOutput_pollInterval).unref();
        }
    }
    /**
     * Stop polling the output file. Called from React useEffect cleanup
     * when the progress component unmounts.
     */
    static stopPolling(taskId) {
        __classPrivateFieldGet(_a, _a, "f", _TaskOutput_activePolling).delete(taskId);
        if (__classPrivateFieldGet(_a, _a, "f", _TaskOutput_activePolling).size === 0 && __classPrivateFieldGet(_a, _a, "f", _TaskOutput_pollInterval)) {
            clearInterval(__classPrivateFieldGet(_a, _a, "f", _TaskOutput_pollInterval));
            __classPrivateFieldSet(_a, _a, null, "f", _TaskOutput_pollInterval);
        }
    }
    /** Write stdout data (pipe mode only — used by hooks). */
    writeStdout(data) {
        __classPrivateFieldGet(this, _TaskOutput_instances, "m", _TaskOutput_writeBuffered).call(this, data, false);
    }
    /** Write stderr data (always piped). */
    writeStderr(data) {
        __classPrivateFieldGet(this, _TaskOutput_instances, "m", _TaskOutput_writeBuffered).call(this, data, true);
    }
    /**
     * Get stdout. In file mode, reads from the output file.
     * In pipe mode, returns the in-memory buffer or tail from CircularBuffer.
     */
    async getStdout() {
        if (this.stdoutToFile) {
            return __classPrivateFieldGet(this, _TaskOutput_instances, "m", _TaskOutput_readStdoutFromFile).call(this);
        }
        // Pipe mode (hooks) — use in-memory data
        if (__classPrivateFieldGet(this, _TaskOutput_disk, "f")) {
            const recent = __classPrivateFieldGet(this, _TaskOutput_recentLines, "f").getRecent(5);
            const tail = safeJoinLines(recent, '\n');
            const sizeKB = Math.round(__classPrivateFieldGet(this, _TaskOutput_totalBytes, "f") / 1024);
            const notice = `\nOutput truncated (${sizeKB}KB total). Full output saved to: ${this.path}`;
            return tail ? tail + notice : notice.trimStart();
        }
        return __classPrivateFieldGet(this, _TaskOutput_stdoutBuffer, "f");
    }
    /** Sync getter for ExecResult.stderr */
    getStderr() {
        if (__classPrivateFieldGet(this, _TaskOutput_disk, "f")) {
            return '';
        }
        return __classPrivateFieldGet(this, _TaskOutput_stderrBuffer, "f");
    }
    get isOverflowed() {
        return __classPrivateFieldGet(this, _TaskOutput_disk, "f") !== null;
    }
    get totalLines() {
        return __classPrivateFieldGet(this, _TaskOutput_totalLines, "f");
    }
    get totalBytes() {
        return __classPrivateFieldGet(this, _TaskOutput_totalBytes, "f");
    }
    /**
     * True after getStdout() when the output file was fully read.
     * The file content is redundant (fully in ExecResult.stdout) and can be deleted.
     */
    get outputFileRedundant() {
        return __classPrivateFieldGet(this, _TaskOutput_outputFileRedundant, "f");
    }
    /** Total file size in bytes, set after getStdout() reads the file. */
    get outputFileSize() {
        return __classPrivateFieldGet(this, _TaskOutput_outputFileSize, "f");
    }
    /** Force all buffered content to disk. Call when backgrounding. */
    spillToDisk() {
        if (!__classPrivateFieldGet(this, _TaskOutput_disk, "f")) {
            __classPrivateFieldGet(this, _TaskOutput_instances, "m", _TaskOutput_spillToDisk).call(this, null, null);
        }
    }
    async flush() {
        await __classPrivateFieldGet(this, _TaskOutput_disk, "f")?.flush();
    }
    /** Delete the output file (fire-and-forget safe). */
    async deleteOutputFile() {
        try {
            await unlink(this.path);
        }
        catch {
            // File may already be deleted or not exist
        }
    }
    clear() {
        __classPrivateFieldSet(this, _TaskOutput_stdoutBuffer, '', "f");
        __classPrivateFieldSet(this, _TaskOutput_stderrBuffer, '', "f");
        __classPrivateFieldGet(this, _TaskOutput_recentLines, "f").clear();
        __classPrivateFieldSet(this, _TaskOutput_onProgress, null, "f");
        __classPrivateFieldGet(this, _TaskOutput_disk, "f")?.cancel();
        _a.stopPolling(this.taskId);
        __classPrivateFieldGet(_a, _a, "f", _TaskOutput_registry).delete(this.taskId);
    }
}
_a = TaskOutput, _TaskOutput_stdoutBuffer = new WeakMap(), _TaskOutput_stderrBuffer = new WeakMap(), _TaskOutput_disk = new WeakMap(), _TaskOutput_recentLines = new WeakMap(), _TaskOutput_totalLines = new WeakMap(), _TaskOutput_totalBytes = new WeakMap(), _TaskOutput_maxMemory = new WeakMap(), _TaskOutput_onProgress = new WeakMap(), _TaskOutput_outputFileRedundant = new WeakMap(), _TaskOutput_outputFileSize = new WeakMap(), _TaskOutput_instances = new WeakSet(), _TaskOutput_tick = function _TaskOutput_tick() {
    for (const [, entry] of __classPrivateFieldGet(_a, _a, "f", _TaskOutput_activePolling)) {
        if (!__classPrivateFieldGet(entry, _TaskOutput_onProgress, "f")) {
            continue;
        }
        void tailFile(entry.path, PROGRESS_TAIL_BYTES).then(({ content, bytesRead, bytesTotal }) => {
            if (!__classPrivateFieldGet(entry, _TaskOutput_onProgress, "f")) {
                return;
            }
            // Always call onProgress even when content is empty, so the
            // progress loop wakes up and can check for backgrounding.
            // Commands like `git log -S` produce no output for long periods.
            if (!content) {
                __classPrivateFieldGet(entry, _TaskOutput_onProgress, "f").call(entry, '', '', __classPrivateFieldGet(entry, _TaskOutput_totalLines, "f"), bytesTotal, false);
                return;
            }
            // Count all newlines in the tail and capture slice points for the
            // last 5 and last 100 lines. Uncapped so extrapolation stays accurate
            // for dense output (short lines → >100 newlines in 4KB).
            let pos = content.length;
            let n5 = 0;
            let n100 = 0;
            let lineCount = 0;
            while (pos > 0) {
                pos = content.lastIndexOf('\n', pos - 1);
                lineCount++;
                if (lineCount === 5)
                    n5 = pos <= 0 ? 0 : pos + 1;
                if (lineCount === 100)
                    n100 = pos <= 0 ? 0 : pos + 1;
            }
            // lineCount is exact when the whole file fits in PROGRESS_TAIL_BYTES.
            // Otherwise extrapolate from the tail sample; monotone max keeps the
            // counter from going backwards when the tail has longer lines on one tick.
            const totalLines = bytesRead >= bytesTotal
                ? lineCount
                : Math.max(__classPrivateFieldGet(entry, _TaskOutput_totalLines, "f"), Math.round((bytesTotal / bytesRead) * lineCount));
            __classPrivateFieldSet(entry, _TaskOutput_totalLines, totalLines, "f");
            __classPrivateFieldSet(entry, _TaskOutput_totalBytes, bytesTotal, "f");
            __classPrivateFieldGet(entry, _TaskOutput_onProgress, "f").call(entry, content.slice(n5), content.slice(n100), totalLines, bytesTotal, bytesRead < bytesTotal);
        }, () => {
            // File may not exist yet
        });
    }
}, _TaskOutput_writeBuffered = function _TaskOutput_writeBuffered(data, isStderr) {
    __classPrivateFieldSet(this, _TaskOutput_totalBytes, __classPrivateFieldGet(this, _TaskOutput_totalBytes, "f") + data.length, "f");
    __classPrivateFieldGet(this, _TaskOutput_instances, "m", _TaskOutput_updateProgress).call(this, data);
    // Write to disk if already overflowed
    if (__classPrivateFieldGet(this, _TaskOutput_disk, "f")) {
        __classPrivateFieldGet(this, _TaskOutput_disk, "f").append(isStderr ? `[stderr] ${data}` : data);
        return;
    }
    // Check if this chunk would exceed the in-memory limit
    const totalMem = __classPrivateFieldGet(this, _TaskOutput_stdoutBuffer, "f").length + __classPrivateFieldGet(this, _TaskOutput_stderrBuffer, "f").length + data.length;
    if (totalMem > __classPrivateFieldGet(this, _TaskOutput_maxMemory, "f")) {
        __classPrivateFieldGet(this, _TaskOutput_instances, "m", _TaskOutput_spillToDisk).call(this, isStderr ? data : null, isStderr ? null : data);
        return;
    }
    if (isStderr) {
        __classPrivateFieldSet(this, _TaskOutput_stderrBuffer, __classPrivateFieldGet(this, _TaskOutput_stderrBuffer, "f") + data, "f");
    }
    else {
        __classPrivateFieldSet(this, _TaskOutput_stdoutBuffer, __classPrivateFieldGet(this, _TaskOutput_stdoutBuffer, "f") + data, "f");
    }
}, _TaskOutput_updateProgress = function _TaskOutput_updateProgress(data) {
    const MAX_PROGRESS_BYTES = 4096;
    const MAX_PROGRESS_LINES = 100;
    let lineCount = 0;
    const lines = [];
    let extractedBytes = 0;
    let pos = data.length;
    while (pos > 0) {
        const prev = data.lastIndexOf('\n', pos - 1);
        if (prev === -1) {
            break;
        }
        lineCount++;
        if (lines.length < MAX_PROGRESS_LINES &&
            extractedBytes < MAX_PROGRESS_BYTES) {
            const lineLen = pos - prev - 1;
            if (lineLen > 0 && lineLen <= MAX_PROGRESS_BYTES - extractedBytes) {
                const line = data.slice(prev + 1, pos);
                if (line.trim()) {
                    lines.push(Buffer.from(line).toString());
                    extractedBytes += lineLen;
                }
            }
        }
        pos = prev;
    }
    __classPrivateFieldSet(this, _TaskOutput_totalLines, __classPrivateFieldGet(this, _TaskOutput_totalLines, "f") + lineCount, "f");
    for (let i = lines.length - 1; i >= 0; i--) {
        __classPrivateFieldGet(this, _TaskOutput_recentLines, "f").add(lines[i]);
    }
    if (__classPrivateFieldGet(this, _TaskOutput_onProgress, "f") && lines.length > 0) {
        const recent = __classPrivateFieldGet(this, _TaskOutput_recentLines, "f").getRecent(5);
        __classPrivateFieldGet(this, _TaskOutput_onProgress, "f").call(this, safeJoinLines(recent, '\n'), safeJoinLines(__classPrivateFieldGet(this, _TaskOutput_recentLines, "f").getRecent(100), '\n'), __classPrivateFieldGet(this, _TaskOutput_totalLines, "f"), __classPrivateFieldGet(this, _TaskOutput_totalBytes, "f"), __classPrivateFieldGet(this, _TaskOutput_disk, "f") !== null);
    }
}, _TaskOutput_spillToDisk = function _TaskOutput_spillToDisk(stderrChunk, stdoutChunk) {
    __classPrivateFieldSet(this, _TaskOutput_disk, new DiskTaskOutput(this.taskId), "f");
    // Flush existing buffers
    if (__classPrivateFieldGet(this, _TaskOutput_stdoutBuffer, "f")) {
        __classPrivateFieldGet(this, _TaskOutput_disk, "f").append(__classPrivateFieldGet(this, _TaskOutput_stdoutBuffer, "f"));
        __classPrivateFieldSet(this, _TaskOutput_stdoutBuffer, '', "f");
    }
    if (__classPrivateFieldGet(this, _TaskOutput_stderrBuffer, "f")) {
        __classPrivateFieldGet(this, _TaskOutput_disk, "f").append(`[stderr] ${__classPrivateFieldGet(this, _TaskOutput_stderrBuffer, "f")}`);
        __classPrivateFieldSet(this, _TaskOutput_stderrBuffer, '', "f");
    }
    // Write the chunk that triggered overflow
    if (stdoutChunk) {
        __classPrivateFieldGet(this, _TaskOutput_disk, "f").append(stdoutChunk);
    }
    if (stderrChunk) {
        __classPrivateFieldGet(this, _TaskOutput_disk, "f").append(`[stderr] ${stderrChunk}`);
    }
}, _TaskOutput_readStdoutFromFile = async function _TaskOutput_readStdoutFromFile() {
    const maxBytes = getMaxOutputLength();
    try {
        const result = await readFileRange(this.path, 0, maxBytes);
        if (!result) {
            __classPrivateFieldSet(this, _TaskOutput_outputFileRedundant, true, "f");
            return '';
        }
        const { content, bytesRead, bytesTotal } = result;
        // If the file fits, it's fully captured inline and can be deleted.
        // If not, return what we read — processToolResultBlock handles
        // the <persisted-output> formatting and persistence downstream.
        __classPrivateFieldSet(this, _TaskOutput_outputFileSize, bytesTotal, "f");
        __classPrivateFieldSet(this, _TaskOutput_outputFileRedundant, bytesTotal <= bytesRead, "f");
        return content;
    }
    catch (err) {
        // Surface the error instead of silently returning empty. An ENOENT here
        // means the output file was deleted while the command was running
        // (historically: cross-session startup cleanup in the same project dir).
        // Returning a diagnostic string keeps the tool_result non-empty, which
        // avoids reminder-only-at-tail confusion downstream and tells the model
        // (and us, via the transcript) what actually happened.
        const code = err instanceof Error && 'code' in err ? String(err.code) : 'unknown';
        logForDebugging(`TaskOutput.#readStdoutFromFile: failed to read ${this.path} (${code}): ${err}`);
        return `<bash output unavailable: output file ${this.path} could not be read (${code}). This usually means another Claude Code process in the same project deleted it during startup cleanup.>`;
    }
};
// --- Shared poller state ---
/** Registry of all file-mode TaskOutput instances with onProgress callbacks. */
_TaskOutput_registry = { value: new Map() };
/** Subset of #registry currently being polled (visibility-driven by React). */
_TaskOutput_activePolling = { value: new Map() };
_TaskOutput_pollInterval = { value: null };
