/**
 * Leaf API-config path resolution — no imports beyond node builtins, so it is
 * safe to use from `bootstrap-entry.ts` (the earliest entry point).
 *
 * Why this exists: `DOGE_API_JSON` used to be resolved with a bare
 * `path.resolve(envPath.trim())` in six separate places. That silently
 * breaks the tilde form: on Windows `path.resolve('~\\.dogekey\\api.json')`
 * yields `<cwd>\\~\\.dogekey\\api.json` — a path that does not exist, so
 * bootstrap loads no config at all and the CLI runs with a fake key.
 *
 * The launchers used to work around it by writing `%USERPROFILE%` themselves.
 * Accepting `~` here means both forms work, matching how every other tool on
 * the platform behaves.
 */
import { homedir } from 'os'
import { resolve } from 'path'

/**
 * Expands a leading `~` to the user's home directory.
 *
 * Deliberately mirrors `expandTilde` in `utils/permissions/pathValidation.ts`
 * — which we cannot import here because it pulls in SandboxManager/Tool.js and
 * this module runs before that graph is safe to load.
 *
 * Only `~`, `~/` and (on Windows) `~\\` are handled. `~user`, `~+`, `~-` are
 * left untouched on purpose: `~Administrator\\.ssh\\id_rsa` names *another*
 * user's home, and expanding it would turn a config-path convenience into a
 * path-injection surface.
 */
export function expandHomePrefix(p: string): string {
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    return homedir() + p.slice(1)
  }
  return p
}

/**
 * Resolves the api.json path from the `DOGE_API_JSON` env var.
 *
 * Returns '' when the variable is unset/blank — callers keep their own
 * fallback (cwd/.doge/api.json, exeDir/.doge/api.json, …) because those
 * defaults legitimately differ per call site.
 *
 * @example
 * resolveApiJsonPath('~\\.dogekey\\api.json')
 * // => 'C:\\Users\\Administrator\\.dogekey\\api.json'
 * resolveApiJsonPath('')
 * // => ''   (caller falls back)
 */
export function resolveApiJsonPath(raw: string | undefined | null): string {
  const trimmed = raw?.trim()
  if (!trimmed) return ''
  return resolve(expandHomePrefix(trimmed))
}
