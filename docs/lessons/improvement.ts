export const IMPROVEMENT_AREAS = {
  // 1. 错误处理
  errorHandling: {
    issue: '部分错误信息不够友好',
    solution: '统一错误处理，提供清晰的错误信息和建议',
    priority: 'high',
  },

  // 2. 性能监控
  performanceMonitoring: {
    issue: '缺乏运行时性能监控',
    solution: '集成 APM 工具，实时监控性能指标',
    priority: 'medium',
  },

  // 3. 文档自动化
  documentationAutomation: {
    issue: 'API 文档需要手动维护',
    solution: '使用 TypeDoc 自动生成 API 文档',
    priority: 'medium',
  },

  // 4. 插件生态
  pluginEcosystem: {
    issue: '插件市场内容较少',
    solution: '提供更好的插件开发工具和文档',
    priority: 'low',
  },

  // 5. 国际化
  internationalization: {
    issue: '目前仅支持中文和英文',
    solution: '支持更多语言，提供 i18n 框架',
    priority: 'low',
  },
};