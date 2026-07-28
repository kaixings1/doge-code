import { homedir } from 'os';
import { join } from 'path';
export function getDogeConfigDir() {
    return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.doge');
}
export function getDogeGlobalConfigFile() {
    return join(getDogeConfigDir(), '.claude.json');
}
//# sourceMappingURL=dogeConfigDir.js.map