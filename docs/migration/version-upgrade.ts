 export const VERSION_UPGRADE = {
  // 升级前检查
  preUpgrade: [
    '备份配置：cp ~/.doge ~/.doge.backup',
    '检查兼容性：doge /doctor',
    '查看变更日志：doge /changelog',
  ],

  // 升级步骤
  upgradeSteps: [
    'git pull',
    'bun install',
    'bun link',
    'doge /migrate',
  ],

  // 升级后验证
  postUpgrade: [
    'doge --version',
    'doge /doctor',
    'doge /test-api',
  ],
};