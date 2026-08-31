const command = {
    name: 'vim',
    description: '在 Vim 和普通编辑模式之间切换',
    supportsNonInteractive: false,
    type: 'local',
    load: () => import('./vim.ts'),
};
export default command;
