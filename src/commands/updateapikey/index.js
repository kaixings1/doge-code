const updateApiKey = {
    type: 'local',
    name: 'updateapikey',
    description: '从 GitHub 更新免费 API Key 到 freeN 配置文件中',
    aliases: ['uak'],
    supportsNonInteractive: true,
    load: () => import('./updateapikey.ts'),
};
export default updateApiKey;
