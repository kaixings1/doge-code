 export const RUNTIME_OPTIMIZATION = {
  // 防抖配置
  debounce: {
    userInput: 300, // 用户输入防抖（毫秒）
    search: 200,    // 搜索防抖
    scroll: 100,    // 滚动防抖
  },

  // 节流配置
  throttle: {
    tokenCount: 1000,  // Token 计数节流（毫秒）
    statusUpdate: 500, // 状态更新节流
  },

  // 缓存配置
  cache: {
    toolResults: {
      enabled: true,
      maxSize: 100 * 1024 * 1024, // 100MB
      ttl: 300000, // 5 分钟
    },
    modelCapabilities: {
      enabled: true,
      ttl: 3600000, // 1 小时
    },
  },

  // 批量操作
  batching: {
    fileOperations: 10, // 批量文件操作数
    toolCalls: 5,       // 批量工具调用数
  },
};