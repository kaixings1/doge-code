export const API_KEY_SECURITY = {
  // 存储
  storage: {
    location: '~/.doge/api.json',
    permissions: '0600', // 仅用户可读写
    encryption: 'AES-256-GCM',
  },

  // 轮换
  rotation: {
    enabled: true,
    interval: 90, // 90 天
    notifyBefore: 7, // 提前 7 天通知
  },

  // 泄露检测
  leakDetection: {
    enabled: true,
    patterns: [
      /sk-ant-[a-zA-Z0-9]{95}/,  // Anthropic
      /sk-[a-zA-Z0-9]{48}/,       // OpenAI
    ],
  },
};