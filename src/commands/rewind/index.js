const rewind = {
    description: '将代码和/或对话恢复到先前的状态',
    name: 'rewind',
    aliases: ['checkpoint', 'undo'],
    argumentHint: '',
    type: 'local',
    supportsNonInteractive: false,
    load: () => import('./rewind.ts'),
};
export default rewind;
