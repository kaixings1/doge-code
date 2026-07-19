export const KEY_FILES = {
  // 入口
  'bootstrap-entry.ts': '启动入口，读取配置并设置环境变量',
  'entrypoints/cli.tsx': 'CLI 入口，解析参数并启动 TUI',
  'main.tsx': '主程序，初始化和启动逻辑',

  // 核心
  'src/query.ts': '查询引擎主循环',
  'src/QueryEngine.ts': '查询引擎实现',
  'src/core.ts': '核心逻辑',
  'src/context.ts': '全局上下文',

  // 注册中心
  'src/commands.ts': '命令注册中心（155 个命令）',
  'src/tools.ts': '工具注册中心（85+ 个工具）',

  // API
  'src/services/api/claude.ts': 'Claude API 客户端',
  'src/services/api/openaiCompat.ts': 'OpenAI 兼容客户端',

  // Bridge
  'src/bridge/': 'OpenAI ↔ Anthropic 桥接层（31 文件）',

  // 配置
  'src/constants/presets.ts': '78+ API 预设',
  'src/constants/prompts.ts': '系统提示词',

  // 构建配置
  'package.json': '包配置',
  'tsconfig.json': 'TypeScript 配置',
  'biome.json': '代码检查配置',
  'vitest.config.ts': '测试配置',
};