import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js';
const config = {
    aliases: ['settings'],
    type: 'local-jsx',
    name: 'config',
    description: '打开配置面板。使用 key=value 直接设置配置项（例如 "thinking=false"），使用 --help 查看所有快捷键',
    argumentHint: '[key=value ...]',
    get immediate() {
        return shouldInferenceConfigCommandBeImmediate();
    },
    load: () => import('./config.tsx'),
};
export default config;
//# sourceMappingURL=index.js.map