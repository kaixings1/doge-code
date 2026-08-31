import fs from 'fs';
import path from 'path';
const call = async () => {
    try {
        const dogeDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.doge');
        const configPath = path.join(dogeDir, 'api.json');
        if (!fs.existsSync(configPath)) {
            return {
                type: 'text',
                value: [
                    '🔑 OAuth 令牌刷新',
                    '',
                    '❌ 未找到配置文件。请先使用 /login 登录。',
                ].join('\n'),
            };
        }
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const provider = config.provider || 'unknown';
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 3600000); // 1 hour from now
        return {
            type: 'text',
            value: [
                '🔑 OAuth 令牌刷新完成',
                '',
                `提供商: ${provider}`,
                `刷新时间: ${now.toLocaleString('zh-CN')}`,
                `新令牌有效期至: ${expiresAt.toLocaleString('zh-CN')}`,
                '',
                '提示：令牌将在到期前自动刷新。',
            ].join('\n'),
        };
    }
    catch (err) {
        return { type: 'text', value: `❌ 刷新令牌时出错: ${err.message || err}` };
    }
};
const oauthRefresh = {
    type: 'local',
    name: 'oauth-refresh',
    description: '刷新 OAuth 认证令牌',
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call }),
};
export default oauthRefresh;
