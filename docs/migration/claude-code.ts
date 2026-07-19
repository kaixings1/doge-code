 export const CLAUDE_CODE_MIGRATION = {
  // 配置迁移
  config: {
    from: '~/.claude/',
    to: '~/.doge/',
    files: ['api.json', 'config.json'],
  },

  // 命令映射
  commandMapping: {
    '/model': '/model',
    '/clear': '/clear',
    '/compact': '/compact',
    '/backup': '/backup',
    '/resume': '/resume',
  },

  // API 兼容性
  apiCompatibility: {
    anthropic: '完全兼容',
    openai: '通过 Bridge 层兼容',
  },

  // 功能差异
  featureDifferences: {
    chineseLocalization: '完全中文本地化',
    presetManagement: '78+ API 预设管理',
    skillSystem: '2688+ 可热加载技能',
    pluginSystem: '插件市场',
    mcpIntegration: 'MCP 服务器集成',
  },
};