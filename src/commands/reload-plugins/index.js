const reloadPlugins = {
    type: 'local',
    name: 'reload-plugins',
    description: '在当前会话中激活待处理的插件更改',
    // SDK callers use query.reloadPlugins() (control request) instead of
    // sending this as a text prompt — that returns structured data
    // (commands, agents, plugins, mcpServers) for UI updates.
    supportsNonInteractive: false,
    load: () => import('./reload-plugins.ts'),
};
export default reloadPlugins;
