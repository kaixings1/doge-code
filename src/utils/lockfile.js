/**
 * Lazy accessor for proper-lockfile.
 *
 * proper-lockfile depends on graceful-fs, which monkey-patches every fs
 * method on first require (~8ms). Static imports of proper-lockfile pull this
 * cost into the startup path even when no locking happens (e.g. `--help`).
 *
 * Import this module instead of `proper-lockfile` directly. The underlying
 * package is only loaded the first time a lock function is actually called.
 */
let _lockfile;
function getLockfile() {
    if (!_lockfile) {
        _lockfile = require('proper-lockfile');
    }
    return _lockfile;
}
export function lock(file, options) {
    return getLockfile().lock(file, options);
}
export function lockSync(file, options) {
    return getLockfile().lockSync(file, options);
}
export function unlock(file, options) {
    return getLockfile().unlock(file, options);
}
export function check(file, options) {
    return getLockfile().check(file, options);
}
//# sourceMappingURL=lockfile.js.map