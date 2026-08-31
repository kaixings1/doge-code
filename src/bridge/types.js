/** Default per-session timeout (24 hours). */
export const DEFAULT_SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;
/** Reusable login guidance appended to bridge auth errors. */
export const BRIDGE_LOGIN_INSTRUCTION = 'Remote Control 仅适用于 claude.ai 订阅。请使用 `/login` 登录你的 claude.ai 账户。';
/** Full error printed when `claude remote-control` is run without auth. */
export const BRIDGE_LOGIN_ERROR = '❌ 错误: 使用远程控制前必须先登录。\n\n' +
    BRIDGE_LOGIN_INSTRUCTION;
/** Shown when the user disconnects Remote Control (via /remote-control or ultraplan launch). */
export const REMOTE_CONTROL_DISCONNECTED_MSG = '远程控制已断开连接。';
