import { isKeybindingCustomizationEnabled } from '../../keybindings/loadUserBindings.js';
const keybindings = {
    name: 'keybindings',
    description: '打开或创建按键绑定配置文件',
    isEnabled: () => isKeybindingCustomizationEnabled(),
    supportsNonInteractive: false,
    type: 'local',
    load: () => import('./keybindings.js'),
};
export default keybindings;
//# sourceMappingURL=index.js.map