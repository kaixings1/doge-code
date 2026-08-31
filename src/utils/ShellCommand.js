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
var _StreamWrapper_instances, _StreamWrapper_stream, _StreamWrapper_isCleanedUp, _StreamWrapper_taskOutput, _StreamWrapper_isStderr, _StreamWrapper_onData, _StreamWrapper_dataHandler, _ShellCommandImpl_instances, _a, _ShellCommandImpl_status, _ShellCommandImpl_backgroundTaskId, _ShellCommandImpl_stdoutWrapper, _ShellCommandImpl_stderrWrapper, _ShellCommandImpl_childProcess, _ShellCommandImpl_timeoutId, _ShellCommandImpl_sizeWatchdog, _ShellCommandImpl_killedForSize, _ShellCommandImpl_maxOutputBytes, _ShellCommandImpl_abortSignal, _ShellCommandImpl_onTimeoutCallback, _ShellCommandImpl_timeout, _ShellCommandImpl_shouldAutoBackground, _ShellCommandImpl_resultResolver, _ShellCommandImpl_exitCodeResolver, _ShellCommandImpl_boundAbortHandler, _ShellCommandImpl_handleTimeout, _ShellCommandImpl_abortHandler, _ShellCommandImpl_exitHandler, _ShellCommandImpl_errorHandler, _ShellCommandImpl_resolveExitCode, _ShellCommandImpl_cleanupListeners, _ShellCommandImpl_clearSizeWatchdog, _ShellCommandImpl_startSizeWatchdog, _ShellCommandImpl_createResultPromise, _ShellCommandImpl_handleExit, _ShellCommandImpl_doKill;
import { stat } from 'fs/promises';
import treeKill from 'tree-kill';
import { generateTaskId } from '../Task.js';
import { formatDuration } from './format.js';
import { MAX_TASK_OUTPUT_BYTES, MAX_TASK_OUTPUT_BYTES_DISPLAY, } from './task/diskOutput.js';
import { TaskOutput } from './task/TaskOutput.js';
const SIGKILL = 137;
const SIGTERM = 143;
// Background tasks write stdout/stderr directly to a file fd (no JS involvement),
// so a stuck append loop can fill the disk. Poll file size and kill when exceeded.
const SIZE_WATCHDOG_INTERVAL_MS = 5000;
function prependStderr(prefix, stderr) {
    return stderr ? `${prefix} ${stderr}` : prefix;
}
/**
 * Thin pipe from a child process stream into TaskOutput.
 * Used in pipe mode (hooks) for stdout and stderr.
 * In file mode (bash commands), both fds go to the output file —
 * the child process streams are null and no wrappers are created.
 */
class StreamWrapper {
    constructor(stream, taskOutput, isStderr) {
        _StreamWrapper_instances.add(this);
        _StreamWrapper_stream.set(this, void 0);
        _StreamWrapper_isCleanedUp.set(this, false);
        _StreamWrapper_taskOutput.set(this, void 0);
        _StreamWrapper_isStderr.set(this, void 0);
        _StreamWrapper_onData.set(this, __classPrivateFieldGet(this, _StreamWrapper_instances, "m", _StreamWrapper_dataHandler).bind(this));
        __classPrivateFieldSet(this, _StreamWrapper_stream, stream, "f");
        __classPrivateFieldSet(this, _StreamWrapper_taskOutput, taskOutput, "f");
        __classPrivateFieldSet(this, _StreamWrapper_isStderr, isStderr, "f");
        // Emit strings instead of Buffers - avoids repeated .toString() calls
        stream.setEncoding('utf-8');
        stream.on('data', __classPrivateFieldGet(this, _StreamWrapper_onData, "f"));
    }
    cleanup() {
        if (__classPrivateFieldGet(this, _StreamWrapper_isCleanedUp, "f")) {
            return;
        }
        __classPrivateFieldSet(this, _StreamWrapper_isCleanedUp, true, "f");
        __classPrivateFieldGet(this, _StreamWrapper_stream, "f").removeListener('data', __classPrivateFieldGet(this, _StreamWrapper_onData, "f"));
        // Release references so the stream, its StringDecoder, and
        // the TaskOutput can be GC'd independently of this wrapper.
        __classPrivateFieldSet(this, _StreamWrapper_stream, null, "f");
        __classPrivateFieldSet(this, _StreamWrapper_taskOutput, null, "f");
        __classPrivateFieldSet(this, _StreamWrapper_onData, () => { }, "f");
    }
}
_StreamWrapper_stream = new WeakMap(), _StreamWrapper_isCleanedUp = new WeakMap(), _StreamWrapper_taskOutput = new WeakMap(), _StreamWrapper_isStderr = new WeakMap(), _StreamWrapper_onData = new WeakMap(), _StreamWrapper_instances = new WeakSet(), _StreamWrapper_dataHandler = function _StreamWrapper_dataHandler(data) {
    const str = typeof data === 'string' ? data : data.toString();
    if (__classPrivateFieldGet(this, _StreamWrapper_isStderr, "f")) {
        __classPrivateFieldGet(this, _StreamWrapper_taskOutput, "f").writeStderr(str);
    }
    else {
        __classPrivateFieldGet(this, _StreamWrapper_taskOutput, "f").writeStdout(str);
    }
};
/**
 * Implementation of ShellCommand that wraps a child process.
 *
 * For bash commands: both stdout and stderr go to a file fd via
 * stdio[1] and stdio[2] — no JS involvement. Progress is extracted
 * by polling the file tail.
 * For hooks: pipe mode with StreamWrappers for real-time detection.
 */
class ShellCommandImpl {
    constructor(childProcess, abortSignal, timeout, taskOutput, shouldAutoBackground = false, maxOutputBytes = MAX_TASK_OUTPUT_BYTES) {
        _ShellCommandImpl_instances.add(this);
        _ShellCommandImpl_status.set(this, 'running');
        _ShellCommandImpl_backgroundTaskId.set(this, void 0);
        _ShellCommandImpl_stdoutWrapper.set(this, void 0);
        _ShellCommandImpl_stderrWrapper.set(this, void 0);
        _ShellCommandImpl_childProcess.set(this, void 0);
        _ShellCommandImpl_timeoutId.set(this, null);
        _ShellCommandImpl_sizeWatchdog.set(this, null);
        _ShellCommandImpl_killedForSize.set(this, false);
        _ShellCommandImpl_maxOutputBytes.set(this, void 0);
        _ShellCommandImpl_abortSignal.set(this, void 0);
        _ShellCommandImpl_onTimeoutCallback.set(this, void 0);
        _ShellCommandImpl_timeout.set(this, void 0);
        _ShellCommandImpl_shouldAutoBackground.set(this, void 0);
        _ShellCommandImpl_resultResolver.set(this, null);
        _ShellCommandImpl_exitCodeResolver.set(this, null);
        _ShellCommandImpl_boundAbortHandler.set(this, null);
        __classPrivateFieldSet(this, _ShellCommandImpl_childProcess, childProcess, "f");
        __classPrivateFieldSet(this, _ShellCommandImpl_abortSignal, abortSignal, "f");
        __classPrivateFieldSet(this, _ShellCommandImpl_timeout, timeout, "f");
        __classPrivateFieldSet(this, _ShellCommandImpl_shouldAutoBackground, shouldAutoBackground, "f");
        __classPrivateFieldSet(this, _ShellCommandImpl_maxOutputBytes, maxOutputBytes, "f");
        this.taskOutput = taskOutput;
        // In file mode (bash commands), both stdout and stderr go to the
        // output file fd — childProcess.stdout/.stderr are both null.
        // In pipe mode (hooks), wrap streams to funnel data into TaskOutput.
        __classPrivateFieldSet(this, _ShellCommandImpl_stderrWrapper, childProcess.stderr
            ? new StreamWrapper(childProcess.stderr, taskOutput, true)
            : null, "f");
        __classPrivateFieldSet(this, _ShellCommandImpl_stdoutWrapper, childProcess.stdout
            ? new StreamWrapper(childProcess.stdout, taskOutput, false)
            : null, "f");
        if (shouldAutoBackground) {
            this.onTimeout = (callback) => {
                __classPrivateFieldSet(this, _ShellCommandImpl_onTimeoutCallback, callback, "f");
            };
        }
        this.result = __classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_createResultPromise).call(this);
    }
    get status() {
        return __classPrivateFieldGet(this, _ShellCommandImpl_status, "f");
    }
    kill() {
        __classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_doKill).call(this);
    }
    background(taskId) {
        if (__classPrivateFieldGet(this, _ShellCommandImpl_status, "f") === 'running') {
            __classPrivateFieldSet(this, _ShellCommandImpl_backgroundTaskId, taskId, "f");
            __classPrivateFieldSet(this, _ShellCommandImpl_status, 'backgrounded', "f");
            __classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_cleanupListeners).call(this);
            if (this.taskOutput.stdoutToFile) {
                // File mode: child writes directly to the fd with no JS involvement.
                // The foreground timeout is gone, so watch file size to prevent
                // a stuck append loop from filling the disk (768GB incident).
                __classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_startSizeWatchdog).call(this);
            }
            else {
                // Pipe mode: spill the in-memory buffer so readers can find it on disk.
                this.taskOutput.spillToDisk();
            }
            return true;
        }
        return false;
    }
    cleanup() {
        __classPrivateFieldGet(this, _ShellCommandImpl_stdoutWrapper, "f")?.cleanup();
        __classPrivateFieldGet(this, _ShellCommandImpl_stderrWrapper, "f")?.cleanup();
        this.taskOutput.clear();
        // Must run before nulling #abortSignal — #cleanupListeners() calls
        // removeEventListener on it. Without this, a kill()+cleanup() sequence
        // crashes: kill() queues #handleExit as a microtask, cleanup() nulls
        // #abortSignal, then #handleExit runs #cleanupListeners() on the null ref.
        __classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_cleanupListeners).call(this);
        // Release references to allow GC of ChildProcess internals and AbortController chain
        __classPrivateFieldSet(this, _ShellCommandImpl_childProcess, null, "f");
        __classPrivateFieldSet(this, _ShellCommandImpl_abortSignal, null, "f");
        __classPrivateFieldSet(this, _ShellCommandImpl_onTimeoutCallback, undefined, "f");
    }
}
_a = ShellCommandImpl, _ShellCommandImpl_status = new WeakMap(), _ShellCommandImpl_backgroundTaskId = new WeakMap(), _ShellCommandImpl_stdoutWrapper = new WeakMap(), _ShellCommandImpl_stderrWrapper = new WeakMap(), _ShellCommandImpl_childProcess = new WeakMap(), _ShellCommandImpl_timeoutId = new WeakMap(), _ShellCommandImpl_sizeWatchdog = new WeakMap(), _ShellCommandImpl_killedForSize = new WeakMap(), _ShellCommandImpl_maxOutputBytes = new WeakMap(), _ShellCommandImpl_abortSignal = new WeakMap(), _ShellCommandImpl_onTimeoutCallback = new WeakMap(), _ShellCommandImpl_timeout = new WeakMap(), _ShellCommandImpl_shouldAutoBackground = new WeakMap(), _ShellCommandImpl_resultResolver = new WeakMap(), _ShellCommandImpl_exitCodeResolver = new WeakMap(), _ShellCommandImpl_boundAbortHandler = new WeakMap(), _ShellCommandImpl_instances = new WeakSet(), _ShellCommandImpl_handleTimeout = function _ShellCommandImpl_handleTimeout(self) {
    if (__classPrivateFieldGet(self, _ShellCommandImpl_shouldAutoBackground, "f") && __classPrivateFieldGet(self, _ShellCommandImpl_onTimeoutCallback, "f")) {
        __classPrivateFieldGet(self, _ShellCommandImpl_onTimeoutCallback, "f").call(self, self.background.bind(self));
    }
    else {
        __classPrivateFieldGet(self, _ShellCommandImpl_instances, "m", _ShellCommandImpl_doKill).call(self, SIGTERM);
    }
}, _ShellCommandImpl_abortHandler = function _ShellCommandImpl_abortHandler() {
    // On 'interrupt' (user submitted a new message), don't kill — let the
    // caller background the process so the model can see partial output.
    if (__classPrivateFieldGet(this, _ShellCommandImpl_abortSignal, "f").reason === 'interrupt') {
        return;
    }
    this.kill();
}, _ShellCommandImpl_exitHandler = function _ShellCommandImpl_exitHandler(code, signal) {
    const exitCode = code !== null && code !== undefined
        ? code
        : signal === 'SIGTERM'
            ? 144
            : 1;
    __classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_resolveExitCode).call(this, exitCode);
}, _ShellCommandImpl_errorHandler = function _ShellCommandImpl_errorHandler() {
    __classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_resolveExitCode).call(this, 1);
}, _ShellCommandImpl_resolveExitCode = function _ShellCommandImpl_resolveExitCode(code) {
    if (__classPrivateFieldGet(this, _ShellCommandImpl_exitCodeResolver, "f")) {
        __classPrivateFieldGet(this, _ShellCommandImpl_exitCodeResolver, "f").call(this, code);
        __classPrivateFieldSet(this, _ShellCommandImpl_exitCodeResolver, null, "f");
    }
}, _ShellCommandImpl_cleanupListeners = function _ShellCommandImpl_cleanupListeners() {
    __classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_clearSizeWatchdog).call(this);
    const timeoutId = __classPrivateFieldGet(this, _ShellCommandImpl_timeoutId, "f");
    if (timeoutId) {
        clearTimeout(timeoutId);
        __classPrivateFieldSet(this, _ShellCommandImpl_timeoutId, null, "f");
    }
    const boundAbortHandler = __classPrivateFieldGet(this, _ShellCommandImpl_boundAbortHandler, "f");
    if (boundAbortHandler) {
        __classPrivateFieldGet(this, _ShellCommandImpl_abortSignal, "f").removeEventListener('abort', boundAbortHandler);
        __classPrivateFieldSet(this, _ShellCommandImpl_boundAbortHandler, null, "f");
    }
}, _ShellCommandImpl_clearSizeWatchdog = function _ShellCommandImpl_clearSizeWatchdog() {
    if (__classPrivateFieldGet(this, _ShellCommandImpl_sizeWatchdog, "f")) {
        clearInterval(__classPrivateFieldGet(this, _ShellCommandImpl_sizeWatchdog, "f"));
        __classPrivateFieldSet(this, _ShellCommandImpl_sizeWatchdog, null, "f");
    }
}, _ShellCommandImpl_startSizeWatchdog = function _ShellCommandImpl_startSizeWatchdog() {
    __classPrivateFieldSet(this, _ShellCommandImpl_sizeWatchdog, setInterval(() => {
        void stat(this.taskOutput.path).then(s => {
            // Bail if the watchdog was cleared while this stat was in flight
            // (process exited on its own) — otherwise we'd mislabel stderr.
            if (s.size > __classPrivateFieldGet(this, _ShellCommandImpl_maxOutputBytes, "f") &&
                __classPrivateFieldGet(this, _ShellCommandImpl_status, "f") === 'backgrounded' &&
                __classPrivateFieldGet(this, _ShellCommandImpl_sizeWatchdog, "f") !== null) {
                __classPrivateFieldSet(this, _ShellCommandImpl_killedForSize, true, "f");
                __classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_clearSizeWatchdog).call(this);
                __classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_doKill).call(this, SIGKILL);
            }
        }, () => {
            // ENOENT before first write, or unlinked mid-run — skip this tick
        });
    }, SIZE_WATCHDOG_INTERVAL_MS), "f");
    __classPrivateFieldGet(this, _ShellCommandImpl_sizeWatchdog, "f").unref();
}, _ShellCommandImpl_createResultPromise = function _ShellCommandImpl_createResultPromise() {
    __classPrivateFieldSet(this, _ShellCommandImpl_boundAbortHandler, __classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_abortHandler).bind(this), "f");
    __classPrivateFieldGet(this, _ShellCommandImpl_abortSignal, "f").addEventListener('abort', __classPrivateFieldGet(this, _ShellCommandImpl_boundAbortHandler, "f"), {
        once: true,
    });
    // Use 'exit' not 'close': 'close' waits for stdio to close, which includes
    // grandchild processes that inherit file descriptors (e.g. `sleep 30 &`).
    // 'exit' fires when the shell itself exits, returning control immediately.
    __classPrivateFieldGet(this, _ShellCommandImpl_childProcess, "f").once('exit', __classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_exitHandler).bind(this));
    __classPrivateFieldGet(this, _ShellCommandImpl_childProcess, "f").once('error', __classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_errorHandler).bind(this));
    __classPrivateFieldSet(this, _ShellCommandImpl_timeoutId, setTimeout(__classPrivateFieldGet(_a, _a, "m", _ShellCommandImpl_handleTimeout), __classPrivateFieldGet(this, _ShellCommandImpl_timeout, "f"), this), "f");
    const exitPromise = new Promise(resolve => {
        __classPrivateFieldSet(this, _ShellCommandImpl_exitCodeResolver, resolve, "f");
    });
    return new Promise(resolve => {
        __classPrivateFieldSet(this, _ShellCommandImpl_resultResolver, resolve, "f");
        void exitPromise.then(__classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_handleExit).bind(this));
    });
}, _ShellCommandImpl_handleExit = async function _ShellCommandImpl_handleExit(code) {
    __classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_cleanupListeners).call(this);
    if (__classPrivateFieldGet(this, _ShellCommandImpl_status, "f") === 'running' || __classPrivateFieldGet(this, _ShellCommandImpl_status, "f") === 'backgrounded') {
        __classPrivateFieldSet(this, _ShellCommandImpl_status, 'completed', "f");
    }
    const stdout = await this.taskOutput.getStdout();
    const result = {
        code,
        stdout,
        stderr: this.taskOutput.getStderr(),
        interrupted: code === SIGKILL,
        backgroundTaskId: __classPrivateFieldGet(this, _ShellCommandImpl_backgroundTaskId, "f"),
    };
    if (this.taskOutput.stdoutToFile && !__classPrivateFieldGet(this, _ShellCommandImpl_backgroundTaskId, "f")) {
        if (this.taskOutput.outputFileRedundant) {
            // Small file — full content is in result.stdout, delete the file
            void this.taskOutput.deleteOutputFile();
        }
        else {
            // Large file — tell the caller where the full output lives
            result.outputFilePath = this.taskOutput.path;
            result.outputFileSize = this.taskOutput.outputFileSize;
            result.outputTaskId = this.taskOutput.taskId;
        }
    }
    if (__classPrivateFieldGet(this, _ShellCommandImpl_killedForSize, "f")) {
        result.stderr = prependStderr(`Background command killed: output file exceeded ${MAX_TASK_OUTPUT_BYTES_DISPLAY}`, result.stderr);
    }
    else if (code === SIGTERM) {
        result.stderr = prependStderr(`命令超时（已执行 ${formatDuration(__classPrivateFieldGet(this, _ShellCommandImpl_timeout, "f"))}）`, result.stderr);
    }
    const resultResolver = __classPrivateFieldGet(this, _ShellCommandImpl_resultResolver, "f");
    if (resultResolver) {
        __classPrivateFieldSet(this, _ShellCommandImpl_resultResolver, null, "f");
        resultResolver(result);
    }
}, _ShellCommandImpl_doKill = function _ShellCommandImpl_doKill(code) {
    __classPrivateFieldSet(this, _ShellCommandImpl_status, 'killed', "f");
    if (__classPrivateFieldGet(this, _ShellCommandImpl_childProcess, "f").pid) {
        treeKill(__classPrivateFieldGet(this, _ShellCommandImpl_childProcess, "f").pid, 'SIGKILL');
    }
    __classPrivateFieldGet(this, _ShellCommandImpl_instances, "m", _ShellCommandImpl_resolveExitCode).call(this, code ?? SIGKILL);
};
/**
 * Wraps a child process to enable flexible handling of shell command execution.
 */
export function wrapSpawn(childProcess, abortSignal, timeout, taskOutput, shouldAutoBackground = false, maxOutputBytes = MAX_TASK_OUTPUT_BYTES) {
    return new ShellCommandImpl(childProcess, abortSignal, timeout, taskOutput, shouldAutoBackground, maxOutputBytes);
}
/**
 * Static ShellCommand implementation for commands that were aborted before execution.
 */
class AbortedShellCommand {
    constructor(opts) {
        this.status = 'killed';
        this.taskOutput = new TaskOutput(generateTaskId('local_bash'), null);
        this.result = Promise.resolve({
            code: opts?.code ?? 145,
            stdout: '',
            stderr: opts?.stderr ?? 'Command aborted before execution',
            interrupted: true,
            backgroundTaskId: opts?.backgroundTaskId,
        });
    }
    background() {
        return false;
    }
    kill() { }
    cleanup() { }
}
export function createAbortedCommand(backgroundTaskId, opts) {
    return new AbortedShellCommand({
        backgroundTaskId,
        ...opts,
    });
}
export function createFailedCommand(preSpawnError) {
    const taskOutput = new TaskOutput(generateTaskId('local_bash'), null);
    return {
        status: 'completed',
        result: Promise.resolve({
            code: 1,
            stdout: '',
            stderr: preSpawnError,
            interrupted: false,
            preSpawnError,
        }),
        taskOutput,
        background() {
            return false;
        },
        kill() { },
        cleanup() { },
    };
}
