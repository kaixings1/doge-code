export const REQUIREMENTS = {
  // 运行时
  runtime: {
    bun: '1.3.5+',
    node: '24+（可选，用于工具链）',
  },

  // 操作系统
  os: {
    windows: 'Windows 10/11',
    macos: 'macOS 12+',
    linux: 'Ubuntu 20.04+ / Debian 11+',
  },

  // 开发工具
  tools: {
    git: '2.30+',
    vscode: '推荐',
    biome: '内置（通过 bun install 安装）',
  },

  // 硬件
  hardware: {
    cpu: '双核 2.0GHz+',
    memory: '8GB+',
    storage: '1GB 可用空间',
  },

  // 网络
  network: {
    'Anthropic API': '访问 https://api.anthropic.com',
    'OpenAI API': '访问 https://api.openai.com',
    npm: '访问 https://registry.npmjs.org',
  },
};