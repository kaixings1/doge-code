import { env } from '../../utils/env.js';
// Terminals that natively support CSI u / Kitty keyboard protocol
const NATIVE_CSIU_TERMINALS = {
    ghostty: 'Ghostty',
    kitty: 'Kitty',
    'iTerm.app': 'iTerm2',
    WezTerm: 'WezTerm',
};
const terminalSetup = {
    type: 'local-jsx',
    name: 'terminal-setup',
    description: env.terminal === 'Apple_Terminal'
        ? '启用 Option+Enter 键绑定用于换行和视觉铃音'
        : '安装 Shift+Enter 键绑定用于换行',
    isHidden: env.terminal !== null && env.terminal in NATIVE_CSIU_TERMINALS,
    load: () => import('./terminalSetup.tsx'),
};
export default terminalSetup;
//# sourceMappingURL=index.js.map