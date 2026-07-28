import { getIsRemoteMode } from '../../bootstrap/state.js';
const session = {
    type: 'local-jsx',
    name: 'session',
    aliases: ['remote'],
    description: '显示远程会话 URL 和二维码',
    isEnabled: () => getIsRemoteMode(),
    get isHidden() {
        return !getIsRemoteMode();
    },
    load: () => import('./session.js'),
};
export default session;
//# sourceMappingURL=index.js.map