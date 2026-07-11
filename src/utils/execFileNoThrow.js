// This file represents useful wrappers over node:child_process
// These wrappers ease error handling and cross-platform compatbility
// By using execa, Windows automatically gets shell escaping + BAT / CMD handling
import { execa } from 'execa';
import { getCwd } from '../utils/cwd.js';
import { logError } from './log.js';
export { execSyncWithDefaults_DEPRECATED } from './execFileNoThrowPortable.js';
const MS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;
export function execFileNoThrow(file, args, options = {
    timeout: 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: true,
    useCwd: true,
}) {
    return execFileNoThrowWithCwd(file, args, {
        abortSignal: options.abortSignal,
        timeout: options.timeout,
        preserveOutputOnError: options.preserveOutputOnError,
        cwd: options.useCwd ? getCwd() : undefined,
        env: options.env,
        stdin: options.stdin,
        input: options.input,
    });
}
/**
 * Extracts a human-readable error message from an execa result.
 *
 * Priority order:
 * 1. shortMessage - execa's human-readable error (e.g., "Command failed with exit code 1: ...")
 *    This is preferred because it already includes signal info when a process is killed,
 *    making it more informative than just the signal name.
 * 2. signal - the signal that killed the process (e.g., "SIGTERM")
 * 3. errorCode - fallback to just the numeric exit code
 */
function getErrorMessage(result, errorCode) {
    if (result.shortMessage) {
        return result.shortMessage;
    }
    if (typeof result.signal === 'string') {
        return result.signal;
    }
    return String(errorCode);
}
/**
 * execFile, but always resolves (never throws)
 */
export function execFileNoThrowWithCwd(file, args, { abortSignal, timeout: finalTimeout = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND, preserveOutputOnError: finalPreserveOutput = true, cwd: finalCwd, env: finalEnv, maxBuffer, shell, stdin: finalStdin, input: finalInput, } = {
    timeout: 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: true,
    maxBuffer: 1_000_000,
}) {
    return new Promise(resolve => {
        // Use execa for cross-platform .bat/.cmd compatibility on Windows
        execa(file, args, {
            maxBuffer,
            signal: abortSignal,
            timeout: finalTimeout,
            cwd: finalCwd,
            env: finalEnv,
            shell,
            stdin: finalStdin,
            input: finalInput,
            reject: false, // Don't throw on non-zero exit codes
        })
            .then(result => {
            if (result.failed) {
                if (finalPreserveOutput) {
                    const errorCode = result.exitCode ?? 1;
                    void resolve({
                        stdout: result.stdout || '',
                        stderr: result.stderr || '',
                        code: errorCode,
                        error: getErrorMessage(result, errorCode),
                    });
                }
                else {
                    void resolve({ stdout: '', stderr: '', code: result.exitCode ?? 1 });
                }
            }
            else {
                void resolve({
                    stdout: result.stdout,
                    stderr: result.stderr,
                    code: 0,
                });
            }
        })
            .catch((error) => {
            logError(error);
            void resolve({ stdout: '', stderr: '', code: 1 });
        });
    });
}
