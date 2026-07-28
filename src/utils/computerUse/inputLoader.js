let cached;
function unwrapDefaultExport(mod) {
    return (typeof mod === 'object' &&
        mod !== null &&
        'default' in mod &&
        mod.default !== undefined
        ? mod.default
        : mod);
}
/**
 * Package's js/index.js reads COMPUTER_USE_INPUT_NODE_PATH (baked by
 * build-with-plugins.ts on darwin targets, unset otherwise — falls through to
 * the node_modules prebuilds/ path).
 *
 * The package exports a discriminated union on `isSupported` — narrowed here
 * once so callers get the bare `ComputerUseInputAPI` without re-checking.
 *
 * key()/keys() dispatch enigo work onto DispatchQueue.main via
 * dispatch2::run_on_main, then block a tokio worker on a channel. Under
 * Electron (CFRunLoop drains the main queue) this works; under libuv
 * (Node/bun) the main queue never drains and the promise hangs. The executor
 * calls these inside drainRunLoop().
 */
export function requireComputerUseInput() {
    if (cached)
        return cached;
    const input = unwrapDefaultExport(require('@ant/computer-use-input'));
    if (!input.isSupported) {
        throw new Error('@ant/computer-use-input is not supported on this platform');
    }
    return (cached = input);
}
//# sourceMappingURL=inputLoader.js.map