const installSlackApp = {
    type: 'local',
    name: 'install-slack-app',
    description: '安装 Claude Slack 应用',
    availability: ['claude-ai'],
    supportsNonInteractive: false,
    load: () => import('./install-slack-app.js'),
};
export default installSlackApp;
