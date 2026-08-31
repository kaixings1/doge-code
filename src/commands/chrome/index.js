import { getIsNonInteractiveSession } from '../../bootstrap/state.js';
const command = {
    name: 'chrome',
    description: 'Claude in Chrome 设置',
    availability: ['claude-ai'],
    isEnabled: () => !getIsNonInteractiveSession(),
    type: 'local-jsx',
    load: () => import('./chrome.tsx'),
};
export default command;
