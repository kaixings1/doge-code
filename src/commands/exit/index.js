const exit = {
    type: 'local-jsx',
    name: 'exit',
    aliases: ['quit'],
    description: '退出 REPL',
    immediate: true,
    load: () => import('./exit.tsx'),
};
export default exit;
