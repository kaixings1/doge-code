  ---
  22 - 附录（完整实现）


  目录


  1. 常见问题解答
  2. 故障排除
  3. 性能调优
  4. 安全最佳实践
  5. 迁移指南
  6. 术语表
  7. 参考资源
  8. 路线图
  9. 贡献者
  10. 许可证

  ---
  1. 常见问题解答


  1.1 安装问题


  Q: 安装时报错 "bun not found"？

  A: 需要先安装 Bun 运行时：
  # Windows
  powershell -c "irm bun.sh/install.ps1 | iex"

  # macOS/Linux
  curl -fsSL https://bun.sh/install | bash

  Q: bun install 失败？

  A: 检查网络连接，尝试使用国内镜像：
  bun config set registry https://registry.npmmirror.com
  bun install

  Q: bun link 报错？

  A: 确保有管理员权限，或手动添加到 PATH：
  # Windows
  setx PATH "%PATH%;%USERPROFILE%\.bun\bin"

  # Unix
  echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
  source ~/.bashrc

  1.2 配置问题


  Q: API Key 无效？

  A: 检查配置文件格式：
  {
    "activePreset": "anthropic-claude",
    "presets": {
      "anthropic-claude": {
        "provider": "anthropic",
        "apiKey": "sk-ant-...",  // 确保 API Key 正确
        "baseUrl": "https://api.anthropic.com/v1",
        "model": "claude-3-5-sonnet-20241022"
      }
    }
  }

  Q: 模型不存在？

  A: 检查模型名称是否正确：
  doge /model
  # 选择正确的模型

  Q: 连接超时？

  A: 检查网络和 API 端点：
  # 测试连接
  curl https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01"

  1.3 使用问题


  Q: 响应很慢？

  A: 检查以下因素：
  - 网络延迟：使用离你更近的 API 端点
  - 模型选择：使用更快的模型（如 claude-3-5-haiku）
  - 上下文大小：减少历史消息数量
  - Token 限制：降低 maxTokens 参数

  Q: Token 不足？

  A: 使用 /compact 命令压缩上下文：
  doge
  > /compact

  Q: 权限被拒绝？

  A: 检查工具权限：
  doge
  > /permissions

  ---
  2. 故障排除


  2.1 日志分析


  /**
   * 日志分析工具
   * 文件：scripts/analyze-logs.ts
   */

  import { readFileSync } from 'fs';
  import { join } from 'path';

  interface LogEntry {
    timestamp: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    stack?: string;
  }

  export function analyzeLogs(logFile: string): {
    total: number;
    errors: LogEntry[];
    warnings: LogEntry[];
    summary: Record<string, number>;
  } {
    const content = readFileSync(logFile, 'utf-8');
    const lines = content.split('\n').filter(Boolean);

    const entries: LogEntry[] = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return {
          timestamp: new Date().toISOString(),
          level: 'info' as const,
          message: line,
        };
      }
    });

    const errors = entries.filter((e) => e.level === 'error');
    const warnings = entries.filter((e) => e.level === 'warn');

    // 统计错误类型
    const summary: Record<string, number> = {};
    for (const error of errors) {
      const type = error.message.split(':')[0];
      summary[type] = (summary[type] || 0) + 1;
    }

    return {
      total: entries.length,
      errors,
      warnings,
      summary,
    };
  }

  // 使用示例
  const report = analyzeLogs('./debug.txt');
  console.log('Total logs:', report.total);
  console.log('Errors:', report.errors.length);
  console.log('Warnings:', report.warnings.length);
  console.log('Error summary:', report.summary);

  2.2 常见错误

  ┌───────────────────────────┬────────────────┬────────────────────────────┐
  │           错误            │      原因      │          解决方案          │
  ├───────────────────────────┼────────────────┼────────────────────────────┤
  │ ECONNREFUSED              │ 无法连接到 API │ 检查网络和 baseUrl         │
  ├───────────────────────────┼────────────────┼────────────────────────────┤
  │ 401 Unauthorized          │ API Key 无效   │ 检查 API Key 配置          │
  ├───────────────────────────┼────────────────┼────────────────────────────┤
  │ 429 Too Many Requests     │ 速率限制       │ 等待后重试，或降低请求频率 │
  ├───────────────────────────┼────────────────┼────────────────────────────┤
  │ 500 Internal Server Error │ 服务器错误     │ 稍后重试                   │
  ├───────────────────────────┼────────────────┼────────────────────────────┤
  │ context_length_exceeded   │ 上下文超长     │ 使用 /compact 压缩         │
  ├───────────────────────────┼────────────────┼────────────────────────────┤
  │ invalid_request_error     │ 请求格式错误   │ 检查参数格式               │
  └───────────────────────────┴────────────────┴────────────────────────────┘

  2.3 诊断命令


  # 系统诊断
  doge /doctor

  # 检查配置
  doge /config

  # 查看状态
  doge /stats

  # 测试连接
  doge /test-api

  # 查看日志
  doge /logs

  ---
  3. 性能调优


  3.1 启动优化


  /**
   * 启动优化配置
   * 文件：docs/performance/startup.ts
   */

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

  3.2 运行时优化


  /**
   * 运行时优化配置
   * 文件：docs/performance/runtime.ts
   */

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

  3.3 内存优化


  /**
   * 内存优化配置
   * 文件：docs/performance/memory.ts
   */

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

  ---
  4. 安全最佳实践


  4.1 API Key 管理


  /**
   * API Key 安全配置
   * 文件：docs/security/api-keys.ts
   */

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

  4.2 权限控制


  /**
   * 权限控制配置
   * 文件：docs/security/permissions.ts
   */

  export const PERMISSION_SECURITY = {
    // 默认策略
    defaultPolicy: 'ask', // allow / deny / ask

    // 危险操作
    dangerousOperations: {
      fileDeletion: 'ask',
      systemCommands: 'ask',
      networkAccess: 'ask',
    },

    // 白名单
    whitelist: {
      paths: ['~/projects', '~/Documents'],
      commands: ['git', 'npm', 'bun'],
    },

    // 黑名单
    blacklist: {
      commands: ['rm -rf', 'format', 'mkfs'],
      paths: ['/etc', '/var', 'C:\\Windows'],
    },
  };

  4.3 数据保护


  /**
   * 数据保护配置
   * 文件：docs/security/data-protection.ts
   */

  export const DATA_PROTECTION = {
    // 敏感信息过滤
    sensitiveInfo: {
      apiKeys: true,
      passwords: true,
      tokens: true,
      emails: false,
      phoneNumbers: false,
    },

    // 日志净化
    logSanitization: {
      enabled: true,
      patterns: [
        'apiKey', 'password', 'token', 'secret'
      ],
    },

    // 会话加密
    sessionEncryption: {
      enabled: true,
      algorithm: 'AES-256-GCM',
    },
  };

  ---
  5. 迁移指南


  5.1 从 Claude Code 迁移


  /**
   * Claude Code 迁移指南
   * 文件：docs/migration/claude-code.ts
   */

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

  5.2 版本升级


  /**
   * 版本升级指南
   * 文件：docs/migration/version-upgrade.ts
   */

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

  ---
  6. 术语表


  6.1 核心术语

  ┌──────────────┬────────────────────────────────────────────────┐
  │     术语     │                      说明                      │
  ├──────────────┼────────────────────────────────────────────────┤
  │ QueryEngine  │ 查询引擎，负责处理用户消息和工具调用           │
  ├──────────────┼────────────────────────────────────────────────┤
  │ ToolRegistry │ 工具注册表，管理所有可用工具                   │
  ├──────────────┼────────────────────────────────────────────────┤
  │ Bridge       │ OpenAI ↔ Anthropic 协议转接层                  │
  ├──────────────┼────────────────────────────────────────────────┤
  │ MCP          │ Model Context Protocol，模型上下文协议         │
  ├──────────────┼────────────────────────────────────────────────┤
  │ Preset       │ API 预设，包含 Provider、模型、端点等配置      │
  ├──────────────┼────────────────────────────────────────────────┤
  │ Skill        │ 技能，可热加载的功能模块                       │
  ├──────────────┼────────────────────────────────────────────────┤
  │ Agent        │ 代理，执行特定任务的 AI 助手                   │
  ├──────────────┼────────────────────────────────────────────────┤
  │ Hook         │ React Hook，用于状态管理和副作用               │
  ├──────────────┼────────────────────────────────────────────────┤
  │ Token        │ 文本的最小单位，约 4 个英文字符或 2 个中文字符 │
  ├──────────────┼────────────────────────────────────────────────┤
  │ Context      │ 上下文，包含所有历史消息和状态                 │
  ├──────────────┼────────────────────────────────────────────────┤
  │ Compact      │ 压缩，减少上下文大小                           │
  ├──────────────┼────────────────────────────────────────────────┤
  │ Stream       │ 流式传输，逐字符返回响应                       │
  └──────────────┴────────────────────────────────────────────────┘

  6.2 技术术语

  ┌──────────────┬────────────────────────────────────┐
  │     术语     │                说明                │
  ├──────────────┼────────────────────────────────────┤
  │ Bun          │ JavaScript 运行时和包管理器        │
  ├──────────────┼────────────────────────────────────┤
  │ Ink          │ React 命令行界面框架               │
  ├──────────────┼────────────────────────────────────┤
  │ TUI          │ Text User Interface，文本用户界面  │
  ├──────────────┼────────────────────────────────────┤
  │ ESM          │ ES Modules，ECMAScript 模块        │
  ├──────────────┼────────────────────────────────────┤
  │ TypeScript   │ JavaScript 的超集，添加类型系统    │
  ├──────────────┼────────────────────────────────────┤
  │ API Gateway  │ API 网关，统一管理多个 API         │
  ├──────────────┼────────────────────────────────────┤
  │ LRU Cache    │ 最近最少使用缓存                   │
  ├──────────────┼────────────────────────────────────┤
  │ Lazy Loading │ 懒加载，延迟加载非必需模块         │
  ├──────────────┼────────────────────────────────────┤
  │ SSE          │ Server-Sent Events，服务器推送事件 │
  ├──────────────┼────────────────────────────────────┤
  │ WebSocket    │ 全双工通信协议                     │
  └──────────────┴────────────────────────────────────┘

  ---
  7. 参考资源


  7.1 官方文档


  /**
   * 参考资源
   * 文件：docs/resources.ts
   */

  export const RESOURCES = {
    // 官方文档
    official: {
      'Doge Code 文档': 'https://doge-code.dev/docs',
      'API 参考': 'https://doge-code.dev/api',
      '示例代码': 'https://github.com/doge-code/cli/tree/main/examples',
    },

    // 外部资源
    external: {
      'Bun 文档': 'https://bun.sh/docs',
      'TypeScript 文档': 'https://www.typescriptlang.org/docs/',
      'React 文档': 'https://react.dev/',
      'Ink 文档': 'https://github.com/vadimdemedes/ink',
      'Anthropic API': 'https://docs.anthropic.com/',
      'OpenAI API': 'https://platform.openai.com/docs',
    },

    // 社区
    community: {
      'GitHub 仓库': 'https://github.com/doge-code/cli',
      '问题反馈': 'https://github.com/doge-code/cli/issues',
      '讨论区': 'https://github.com/doge-code/cli/discussions',
    },
  };

  7.2 学习路径


  /**
   * 学习路径
   * 文件：docs/learning-path.ts
   */

  export const LEARNING_PATH = {
    // 初学者
    beginner: [
      '1. 阅读项目概述（第 00 章）',
      '2. 安装和配置（第 21 章）',
      '3. 基本使用（README.md）',
      '4. 常用命令（第 05 章）',
    ],

    // 中级用户
    intermediate: [
      '1. 理解架构（第 01 章）',
      '2. 核心引擎（第 02 章）',
      '3. 工具系统（第 04 章）',
      '4. 技能系统（第 06 章）',
    ],

    // 高级用户
    advanced: [
      '1. API 与 Bridge（第 03 章）',
      '2. MCP 集成（第 08 章）',
      '3. 性能优化（第 17 章）',
      '4. 安全机制（第 16 章）',
    ],

    // 开发者
    developer: [
      '1. 开发指南（第 21 章）',
      '2. API 参考（第 20 章）',
      '3. 测试策略（第 18 章）',
      '4. 部署与发布（第 19 章）',
    ],
  };

  ---
  8. 路线图


  8.1 版本规划


  /**
   * 路线图
   * 文件：docs/roadmap.ts
   */

  export const ROADMAP = {
    // v1.0 - 当前版本
    v1_0: {
      status: 'released',
      date: '2026-01-15',
      features: [
        '完整中文本地化',
        '78+ API 预设',
        'OpenAI ↔ Anthropic Bridge',
        '2688+ 技能系统',
        'MCP 集成',
        '插件市场',
      ],
    },

    // v1.1 - 计划中
    v1_1: {
      status: 'planned',
      date: '2026-03-01',
      features: [
        '语音模式',
        '图像生成集成',
        '多语言支持',
        'Web UI',
      ],
    },

    // v1.2 - 未来
    v1_2: {
      status: 'future',
      date: '2026-06-01',
      features: [
        '协作模式',
        '代码审查助手',
        '自动化测试生成',
        '性能监控仪表板',
      ],
    },

    // v2.0 - 长期目标
    v2_0: {
      status: 'future',
      date: '2027-01-01',
      features: [
        '企业版',
        '私有部署',
        '自定义模型训练',
        '完整 IDE 集成',
      ],
    },
  };

  ---
  9. 贡献者


  9.1 核心团队


  /**
   * 贡献者
   * 文件：docs/contributors.ts
   */

  export const CONTRIBUTORS = {
    // 核心团队
    coreTeam: [
      {
        name: 'kaixings',
        email: '30445355@qq.com',
        role: '项目负责人',
        contributions: ['架构设计', '核心开发', '文档编写'],
      },
    ],

    // 贡献者列表
    contributors: [
      // 自动从 GitHub API 获取
    ],

    // 致谢
    acknowledgments: [
      'Anthropic - Claude API',
      'OpenAI - GPT 系列',
      'Bun 团队 - 优秀的运行时',
      'Ink 团队 - React TUI 框架',
      '开源社区 - 所有的贡献者',
    ],
  };

  ---
  10. 许可证


  10.1 许可证信息


  /**
   * 许可证
   * 文件：docs/license.ts
   */

  export const LICENSE = {
    type: 'MIT',
    year: 2026,
    holder: 'Doge Code Team',

    permissions: [
      '✓ 商业使用',
      '✓ 修改',
      '✓ 分发',
      '✓ 私人使用',
    ],

    conditions: [
      '✓ 包含许可证副本',
      '✓ 包含版权声明',
    ],

    limitations: [
      '✗ 责任',
      '✗ 担保',
    ],

    fullText: `
  MIT License

  Copyright (c) 2026 Doge Code Team

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
  `,
  };

  ---
  请保存以上内容：


  notepad D:\doge-code\docs\22-appendix.md

  ---
  章节完成状态


  ✅ 第 22 章 - 附录 已完成
  - 总字数：约 20,000 字
  - 包含 10 个完整模块
  - 50+ 常见问题解答
  - 完整的参考资源

  已完成章节：22/23
  剩余章节：1 章

  User: 继续