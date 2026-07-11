const help = {
    type: 'local-jsx',
    name: 'help',
    description: '显示帮助和可用命令',
    load: () => import('./help.js'),
};
export default help;
