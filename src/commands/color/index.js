const color = {
    type: 'local-jsx',
    name: 'color',
    description: '设置此会话的提示栏颜色',
    immediate: true,
    argumentHint: '<color|default>',
    load: () => import('./color.ts'),
};
export default color;
