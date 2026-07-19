export const TECHNICAL_CHALLENGES = {
  // Bridge 层实现
  bridge: {
    challenge: 'OpenAI 和 Anthropic 协议差异巨大',
    solution: '构建完整的协议转接层，处理消息格式、工具调用、流式传输等所有差异',
    impact: '实现无缝切换 API Provider',
  },

  // 性能优化
  performance: {
    challenge: '2,688+ 技能的快速加载和索引',
    solution: '实现懒加载、LRU 缓存、并行索引',
    impact: '启动时间 <500ms',
  },

  // Windows 兼容
  windowsCompatibility: {
    challenge: 'MSYS2 Bash 破坏引号和特殊字符',
    solution: '完全避免通过 Bash 执行文件操作，使用专用 API 工具',
    impact: 'Windows 下稳定运行',
  },

  // 内存管理
  memory: {
    challenge: '大量技能和插件导致的内存压力',
    solution: '实现 LRU 缓存、上下文压缩、GC 优化',
    impact: '内存占用 <256MB',
  },

  // 类型安全
  typeSafety: {
    challenge: '复杂的类型系统维护',
    solution: '完整的 TypeScript 类型定义，100+ 接口',
    impact: '编译时错误检测',
  },
};