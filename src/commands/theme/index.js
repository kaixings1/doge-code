const theme = {
    type: 'local-jsx',
    name: 'theme',
    description: '更改主题',
    load: () => import('./theme.js'),
};
export default theme;
