const resume = {
    type: 'local-jsx',
    name: 'resume',
    description: '恢复之前的对话',
    aliases: ['continue'],
    argumentHint: '[conversation id or search term]',
    load: () => import('./resume.tsx'),
};
export default resume;
