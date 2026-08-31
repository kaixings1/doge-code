const btw = {
    type: 'local-jsx',
    name: 'btw',
    description: '询问快速侧面问题，不中断主对话',
    immediate: true,
    argumentHint: '<question>',
    load: () => import('./btw.tsx'),
};
export default btw;
