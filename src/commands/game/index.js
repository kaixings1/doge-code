const game = {
    type: 'local-jsx',
    name: 'game',
    description: '玩一个简单的猜数字游戏',
    aliases: ['guess'],
    argumentHint: '[数字]',
    load: () => import('./game.js'),
};
export default game;
//# sourceMappingURL=index.js.map