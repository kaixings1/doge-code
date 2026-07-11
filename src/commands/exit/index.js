const exit = {
    type: 'local-jsx',
    name: 'exit',
    aliases: ['quit'],
    description: '退出 REPL',
    immediate: true,
    load: () => import('./exit.js'),
};
export default exit;
