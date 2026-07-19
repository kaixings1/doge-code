export const STARTUP_OPTIMIZATION = {
  // 懒加载模块
  lazyLoading: {
    skills: '延迟加载技能（仅在使用时加载）',
    plugins: '延迟加载插件',
    commands: '延迟加载命令',
  },

  // 缓存预热
  cacheWarmup: {
    presets: '预加载预设配置',
    modelCapabilities: '预加载模型能力',
  },

  // 代码分割
  codeSplitting: {
    bridge: 'Bridge 层独立打包',
    mcp: 'MCP 系统独立打包',
    ui: 'UI 组件独立打包',
  },
};