const outputStyle = {
    type: 'local-jsx',
    name: 'output-style',
    description: '已弃用：使用 /config 更改输出样式',
    isHidden: true,
    load: () => import('./output-style.js'),
};
export default outputStyle;
