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
 * Package's js/index.js reads COMPUTER_USE_SWIFT_NODE_PATH (baked by
 * build-with-plugins.ts on darwin targets, unset otherwise — falls through to
 * the node_modules prebuilds/ path). We cache the loaded native module.
 *
 * The four @MainActor methods (captureExcluding, captureRegion,
 * apps.listInstalled, resolvePrepareCapture) dispatch to DispatchQueue.main
 * and will hang under libuv unless CFRunLoop is pumped — call sites wrap
 * these in drainRunLoop().
 */
export function requireComputerUseSwift() {
    if (process.platform !== 'darwin') {
        throw new Error('@ant/computer-use-swift is macOS-only');
    }
    return (cached ?? (cached = unwrapDefaultExport(require('@ant/computer-use-swift'))));
}
