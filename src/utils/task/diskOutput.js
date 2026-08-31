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
var _DiskTaskOutput_instances, _DiskTaskOutput_path, _DiskTaskOutput_fileHandle, _DiskTaskOutput_queue, _DiskTaskOutput_bytesWritten, _DiskTaskOutput_capped, _DiskTaskOutput_flushPromise, _DiskTaskOutput_flushResolve, _DiskTaskOutput_drainAllChunks, _DiskTaskOutput_writeAllChunks, _DiskTaskOutput_queueToBuffers, _DiskTaskOutput_drain;
import { constants as fsConstants } from 'fs';
import { mkdir, open, stat, symlink, unlink, } from 'fs/promises';
import { join } from 'path';
import { getSessionId } from '../../bootstrap/state.js';
import { getErrnoCode } from '../errors.js';
import { readFileRange, tailFile } from '../fsOperations.js';
import { logError } from '../log.js';
import { getProjectTempDir } from '../permissions/filesystem.js';
// SECURITY: O_NOFOLLOW prevents following symlinks when opening task output files.
// Without this, an attacker in the sandbox could create symlinks in the tasks directory
// pointing to arbitrary files, causing Claude Code on the host to write to those files.
// O_NOFOLLOW is not available on Windows, but the sandbox attack vector is Unix-only.
const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const DEFAULT_MAX_READ_BYTES = 8 * 1024 * 1024; // 8MB
/**
 * Disk cap for task output files. In file mode (bash), a watchdog polls
 * file size and kills the process. In pipe mode (hooks), DiskTaskOutput
 * drops chunks past this limit. Shared so both caps stay in sync.
 */
export const MAX_TASK_OUTPUT_BYTES = 5 * 1024 * 1024 * 1024;
export const MAX_TASK_OUTPUT_BYTES_DISPLAY = '5GB';
/**
 * Get the task output directory for this session.
 * Uses project temp directory so reads are auto-allowed by checkReadableInternalPath.
 *
 * The session ID is included so concurrent sessions in the same project don't
 * clobber each other's output files. Startup cleanup in one session previously
 * unlinked in-flight output files from other sessions — the writing process's fd
 * keeps the inode alive but reads via path fail ENOENT, and getStdout() returned
 * empty string (inc-4586 / boris-20260309-060423).
 *
 * The session ID is captured at FIRST CALL, not re-read on every invocation.
 * /clear calls regenerateSessionId(), which would otherwise cause
 * ensureOutputDir() to create a new-session path while existing TaskOutput
 * instances still hold old-session paths — open() would ENOENT. Background
 * bash tasks surviving /clear need their output files to stay reachable.
 */
let _taskOutputDir;
export function getTaskOutputDir() {
    if (_taskOutputDir === undefined) {
        _taskOutputDir = join(getProjectTempDir(), getSessionId(), 'tasks');
    }
    return _taskOutputDir;
}
/** Test helper — clears the memoized dir. */
export function _resetTaskOutputDirForTest() {
    _taskOutputDir = undefined;
}
/**
 * Ensure the task output directory exists
 */
async function ensureOutputDir() {
    await mkdir(getTaskOutputDir(), { recursive: true });
}
/**
 * Get the output file path for a task
 */
export function getTaskOutputPath(taskId) {
    return join(getTaskOutputDir(), `${taskId}.output`);
}
// Tracks fire-and-forget promises (initTaskOutput, initTaskOutputAsSymlink,
// evictTaskOutput, #drain) so tests can drain before teardown. Prevents the
// async-ENOENT-after-teardown flake class (#24957, #25065): a voided async
// resumes after preload's afterEach nuked the temp dir → ENOENT → unhandled
// rejection → flaky test failure. allSettled so a rejection doesn't short-
// circuit the drain and leave other ops racing the rmSync.
const _pendingOps = new Set();
function track(p) {
    _pendingOps.add(p);
    void p.finally(() => _pendingOps.delete(p)).catch(() => { });
    return p;
}
/**
 * Encapsulates async disk writes for a single task's output.
 *
 * Uses a flat array as a write queue processed by a single drain loop,
 * so each chunk can be GC'd immediately after its write completes.
 * This avoids the memory retention problem of chained .then() closures
 * where every reaction captures its data until the whole chain resolves.
 */
export class DiskTaskOutput {
    constructor(taskId) {
        _DiskTaskOutput_instances.add(this);
        _DiskTaskOutput_path.set(this, void 0);
        _DiskTaskOutput_fileHandle.set(this, null);
        _DiskTaskOutput_queue.set(this, []);
        _DiskTaskOutput_bytesWritten.set(this, 0);
        _DiskTaskOutput_capped.set(this, false);
        _DiskTaskOutput_flushPromise.set(this, null);
        _DiskTaskOutput_flushResolve.set(this, null);
        __classPrivateFieldSet(this, _DiskTaskOutput_path, getTaskOutputPath(taskId), "f");
    }
    append(content) {
        if (__classPrivateFieldGet(this, _DiskTaskOutput_capped, "f")) {
            return;
        }
        // content.length (UTF-16 code units) undercounts UTF-8 bytes by at most ~3×.
        // Acceptable for a coarse disk-fill guard — avoids re-scanning every chunk.
        __classPrivateFieldSet(this, _DiskTaskOutput_bytesWritten, __classPrivateFieldGet(this, _DiskTaskOutput_bytesWritten, "f") + content.length, "f");
        if (__classPrivateFieldGet(this, _DiskTaskOutput_bytesWritten, "f") > MAX_TASK_OUTPUT_BYTES) {
            __classPrivateFieldSet(this, _DiskTaskOutput_capped, true, "f");
            __classPrivateFieldGet(this, _DiskTaskOutput_queue, "f").push(`\n[output truncated: exceeded ${MAX_TASK_OUTPUT_BYTES_DISPLAY} disk cap]\n`);
        }
        else {
            __classPrivateFieldGet(this, _DiskTaskOutput_queue, "f").push(content);
        }
        if (!__classPrivateFieldGet(this, _DiskTaskOutput_flushPromise, "f")) {
            __classPrivateFieldSet(this, _DiskTaskOutput_flushPromise, new Promise(resolve => {
                __classPrivateFieldSet(this, _DiskTaskOutput_flushResolve, resolve, "f");
            }), "f");
            void track(__classPrivateFieldGet(this, _DiskTaskOutput_instances, "m", _DiskTaskOutput_drain).call(this));
        }
    }
    flush() {
        return __classPrivateFieldGet(this, _DiskTaskOutput_flushPromise, "f") ?? Promise.resolve();
    }
    cancel() {
        __classPrivateFieldGet(this, _DiskTaskOutput_queue, "f").length = 0;
    }
}
_DiskTaskOutput_path = new WeakMap(), _DiskTaskOutput_fileHandle = new WeakMap(), _DiskTaskOutput_queue = new WeakMap(), _DiskTaskOutput_bytesWritten = new WeakMap(), _DiskTaskOutput_capped = new WeakMap(), _DiskTaskOutput_flushPromise = new WeakMap(), _DiskTaskOutput_flushResolve = new WeakMap(), _DiskTaskOutput_instances = new WeakSet(), _DiskTaskOutput_drainAllChunks = async function _DiskTaskOutput_drainAllChunks() {
    while (true) {
        try {
            if (!__classPrivateFieldGet(this, _DiskTaskOutput_fileHandle, "f")) {
                await ensureOutputDir();
                __classPrivateFieldSet(this, _DiskTaskOutput_fileHandle, await open(__classPrivateFieldGet(this, _DiskTaskOutput_path, "f"), process.platform === 'win32'
                    ? 'a'
                    : fsConstants.O_WRONLY |
                        fsConstants.O_APPEND |
                        fsConstants.O_CREAT |
                        O_NOFOLLOW), "f");
            }
            while (true) {
                await __classPrivateFieldGet(this, _DiskTaskOutput_instances, "m", _DiskTaskOutput_writeAllChunks).call(this);
                if (__classPrivateFieldGet(this, _DiskTaskOutput_queue, "f").length === 0) {
                    break;
                }
            }
        }
        finally {
            if (__classPrivateFieldGet(this, _DiskTaskOutput_fileHandle, "f")) {
                const fileHandle = __classPrivateFieldGet(this, _DiskTaskOutput_fileHandle, "f");
                __classPrivateFieldSet(this, _DiskTaskOutput_fileHandle, null, "f");
                await fileHandle.close();
            }
        }
        // you could have another .append() while we're waiting for the file to close, so we check the queue again before fully exiting
        if (__classPrivateFieldGet(this, _DiskTaskOutput_queue, "f").length) {
            continue;
        }
        break;
    }
}, _DiskTaskOutput_writeAllChunks = function _DiskTaskOutput_writeAllChunks() {
    // This code is extremely precise.
    // You **must not** add an await here!! That will cause memory to balloon as the queue grows.
    // It's okay to add an `await` to the caller of this method (e.g. #drainAllChunks) because that won't cause Buffer[] to be kept alive in memory.
    return __classPrivateFieldGet(this, _DiskTaskOutput_fileHandle, "f").appendFile(
    // This variable needs to get GC'd ASAP.
    __classPrivateFieldGet(this, _DiskTaskOutput_instances, "m", _DiskTaskOutput_queueToBuffers).call(this));
}, _DiskTaskOutput_queueToBuffers = function _DiskTaskOutput_queueToBuffers() {
    // Use .splice to in-place mutate the array, informing the GC it can free it.
    const queue = __classPrivateFieldGet(this, _DiskTaskOutput_queue, "f").splice(0, __classPrivateFieldGet(this, _DiskTaskOutput_queue, "f").length);
    let totalLength = 0;
    for (const str of queue) {
        totalLength += Buffer.byteLength(str, 'utf8');
    }
    const buffer = Buffer.allocUnsafe(totalLength);
    let offset = 0;
    for (const str of queue) {
        offset += buffer.write(str, offset, 'utf8');
    }
    return buffer;
}, _DiskTaskOutput_drain = async function _DiskTaskOutput_drain() {
    try {
        await __classPrivateFieldGet(this, _DiskTaskOutput_instances, "m", _DiskTaskOutput_drainAllChunks).call(this);
    }
    catch (e) {
        // Transient fs errors (EMFILE on busy CI, EPERM on Windows pending-
        // delete) previously rode up through `void this.#drain()` as an
        // unhandled rejection while the flush promise resolved anyway — callers
        // saw an empty file with no error. Retry once for the transient case
        // (queue is intact if open() failed), then log and give up.
        logError(e);
        if (__classPrivateFieldGet(this, _DiskTaskOutput_queue, "f").length > 0) {
            try {
                await __classPrivateFieldGet(this, _DiskTaskOutput_instances, "m", _DiskTaskOutput_drainAllChunks).call(this);
            }
            catch (e2) {
                logError(e2);
            }
        }
    }
    finally {
        const resolve = __classPrivateFieldGet(this, _DiskTaskOutput_flushResolve, "f");
        __classPrivateFieldSet(this, _DiskTaskOutput_flushPromise, null, "f");
        __classPrivateFieldSet(this, _DiskTaskOutput_flushResolve, null, "f");
        resolve();
    }
};
const outputs = new Map();
/**
 * Test helper — cancel pending writes, await in-flight ops, clear the map.
 * backgroundShells.test.ts and other task tests spawn real shells that
 * write through this module without afterEach cleanup; their entries
 * leak into diskOutput.test.ts on the same shard.
 *
 * Awaits all tracked promises until the set stabilizes — a settling promise
 * may spawn another (initTaskOutputAsSymlink's catch → initTaskOutput).
 * Call this in afterEach BEFORE rmSync to avoid async-ENOENT-after-teardown.
 */
export async function _clearOutputsForTest() {
    for (const output of outputs.values()) {
        output.cancel();
    }
    while (_pendingOps.size > 0) {
        await Promise.allSettled([..._pendingOps]);
    }
    outputs.clear();
}
function getOrCreateOutput(taskId) {
    let output = outputs.get(taskId);
    if (!output) {
        output = new DiskTaskOutput(taskId);
        outputs.set(taskId, output);
    }
    return output;
}
/**
 * Append output to a task's disk file asynchronously.
 * Creates the file if it doesn't exist.
 */
export function appendTaskOutput(taskId, content) {
    getOrCreateOutput(taskId).append(content);
}
/**
 * Wait for all pending writes for a task to complete.
 * Useful before reading output to ensure all data is flushed.
 */
export async function flushTaskOutput(taskId) {
    const output = outputs.get(taskId);
    if (output) {
        await output.flush();
    }
}
/**
 * Evict a task's DiskTaskOutput from the in-memory map after flushing.
 * Unlike cleanupTaskOutput, this does not delete the output file on disk.
 * Call this when a task completes and its output has been consumed.
 */
export function evictTaskOutput(taskId) {
    return track((async () => {
        const output = outputs.get(taskId);
        if (output) {
            await output.flush();
            outputs.delete(taskId);
        }
    })());
}
/**
 * Get delta (new content) since last read.
 * Reads only from the byte offset, up to maxBytes — never loads the full file.
 */
export async function getTaskOutputDelta(taskId, fromOffset, maxBytes = DEFAULT_MAX_READ_BYTES) {
    try {
        const result = await readFileRange(getTaskOutputPath(taskId), fromOffset, maxBytes);
        if (!result) {
            return { content: '', newOffset: fromOffset };
        }
        return {
            content: result.content,
            newOffset: fromOffset + result.bytesRead,
        };
    }
    catch (e) {
        const code = getErrnoCode(e);
        if (code === 'ENOENT') {
            return { content: '', newOffset: fromOffset };
        }
        logError(e);
        return { content: '', newOffset: fromOffset };
    }
}
/**
 * Get output for a task, reading the tail of the file.
 * Caps at maxBytes to avoid loading multi-GB files into memory.
 */
export async function getTaskOutput(taskId, maxBytes = DEFAULT_MAX_READ_BYTES) {
    try {
        const { content, bytesTotal, bytesRead } = await tailFile(getTaskOutputPath(taskId), maxBytes);
        if (bytesTotal > bytesRead) {
            return `[${Math.round((bytesTotal - bytesRead) / 1024)}KB of earlier output omitted]\n${content}`;
        }
        return content;
    }
    catch (e) {
        const code = getErrnoCode(e);
        if (code === 'ENOENT') {
            return '';
        }
        logError(e);
        return '';
    }
}
/**
 * Get the current size (offset) of a task's output file.
 */
export async function getTaskOutputSize(taskId) {
    try {
        return (await stat(getTaskOutputPath(taskId))).size;
    }
    catch (e) {
        const code = getErrnoCode(e);
        if (code === 'ENOENT') {
            return 0;
        }
        logError(e);
        return 0;
    }
}
/**
 * Clean up a task's output file and write queue.
 */
export async function cleanupTaskOutput(taskId) {
    const output = outputs.get(taskId);
    if (output) {
        output.cancel();
        outputs.delete(taskId);
    }
    try {
        await unlink(getTaskOutputPath(taskId));
    }
    catch (e) {
        const code = getErrnoCode(e);
        if (code === 'ENOENT') {
            return;
        }
        logError(e);
    }
}
/**
 * Initialize output file for a new task.
 * Creates an empty file to ensure the path exists.
 */
export function initTaskOutput(taskId) {
    return track((async () => {
        await ensureOutputDir();
        const outputPath = getTaskOutputPath(taskId);
        // SECURITY: O_NOFOLLOW prevents symlink-following attacks from the sandbox.
        // O_EXCL ensures we create a new file and fail if something already exists at this path.
        // On Windows, use string flags — numeric O_EXCL can produce EINVAL through libuv.
        const fh = await open(outputPath, process.platform === 'win32'
            ? 'wx'
            : fsConstants.O_WRONLY |
                fsConstants.O_CREAT |
                fsConstants.O_EXCL |
                O_NOFOLLOW);
        await fh.close();
        return outputPath;
    })());
}
/**
 * Initialize output file as a symlink to another file (e.g., agent transcript).
 * Tries to create the symlink first; if a file already exists, removes it and retries.
 */
export function initTaskOutputAsSymlink(taskId, targetPath) {
    return track((async () => {
        try {
            await ensureOutputDir();
            const outputPath = getTaskOutputPath(taskId);
            try {
                await symlink(targetPath, outputPath);
            }
            catch {
                await unlink(outputPath);
                await symlink(targetPath, outputPath);
            }
            return outputPath;
        }
        catch (error) {
            logError(error);
            return initTaskOutput(taskId);
        }
    })());
}
