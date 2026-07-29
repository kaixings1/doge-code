import { isEnvTruthy } from '../../utils/envUtils.js';
const installGitHubApp = {
    type: 'local-jsx',
    name: 'install-github-app',
    description: '为仓库设置 Claude GitHub Actions',
    availability: ['claude-ai', 'console'],
    isEnabled: () => !isEnvTruthy(process.env.DISABLE_INSTALL_GITHUB_APP_COMMAND),
    load: () => import('./install-github-app.tsx'),
};
export default installGitHubApp;
//# sourceMappingURL=index.js.map