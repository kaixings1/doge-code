 export const MEMORY_OPTIMIZATION = {
  // GC 配置
  garbageCollection: {
    enabled: true,
    interval: 60000, // 1 分钟
    threshold: 256 * 1024 * 1024, // 256MB
  },

  // LRU 缓存
  lruCache: {
    maxMessages: 1000,
    maxToolResults: 100,
    maxSkills: 100,
  },

  // 上下文压缩
  contextCompaction: {
    enabled: true,
    threshold: 0.8, // 80% 时触发
    strategy: 'summarize',
    preserveRecent: 10,
  },
};