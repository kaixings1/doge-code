// ============================================================================
// AgentRegistry — 20大代理功能注册表
// 将 Claude Code CLI 的专业代理能力集成到桌面应用
// ============================================================================

export interface AgentCapability {
  type: string
  name: string
  description: string
  icon: string
  category: 'development' | 'architecture' | 'security' | 'devops' | 'data' | 'design' | 'testing' | 'documentation'
  systemPrompt: string
  allowedTools: string[]
}

/**
 * 20大专业代理能力定义
 * 每个代理都有特定的系统提示和工具权限
 */
export const AGENT_CAPABILITIES: Record<string, AgentCapability> = {
  // ─── 开发类 ───
  'android-developer': {
    type: 'android-developer',
    name: 'Android 开发专家',
    description: '专精 Android 应用开发，包括 Kotlin/Java、Jetpack Compose、Android Studio 配置',
    icon: '📱',
    category: 'development',
    systemPrompt: '你是一名资深 Android 开发专家，精通 Kotlin/Java、Jetpack Compose、Android SDK、Gradle 构建系统。能够帮助用户开发、调试和优化 Android 应用。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch'],
  },
  'frontend-developer': {
    type: 'frontend-developer',
    name: '前端开发专家',
    description: '精通 React/Vue/Angular、CSS/SCSS、前端性能优化、无障碍设计',
    icon: '🎨',
    category: 'development',
    systemPrompt: '你是一名资深前端开发专家，精通 React、Vue、Angular 等现代前端框架，CSS/SCSS、TypeScript、前端性能优化、无障碍设计和跨浏览器兼容。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch'],
  },
  'backend-architect': {
    type: 'backend-architect',
    name: '后端架构专家',
    description: '专精服务端架构设计、API 设计、数据库优化、微服务架构',
    icon: '⚙️',
    category: 'architecture',
    systemPrompt: '你是一名资深后端架构师，精通服务端架构设计、RESTful/GraphQL API 设计、数据库设计与优化、微服务架构、消息队列、缓存策略和分布式系统。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch'],
  },
  'fullstack-engineer': {
    type: 'fullstack-engineer',
    name: '全栈工程师',
    description: '前后端全栈开发，从数据库到 UI 的完整应用开发能力',
    icon: '🔧',
    category: 'development',
    systemPrompt: '你是一名全栈工程师，精通前后端开发。能够处理数据库设计、API 开发、前端 UI 实现、部署运维等全链路开发任务。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch'],
  },
  'mobile-developer': {
    type: 'mobile-developer',
    name: '移动开发专家',
    description: 'iOS/Android 原生开发和跨平台框架（Flutter/React Native）',
    icon: '📲',
    category: 'development',
    systemPrompt: '你是一名移动开发专家，精通 iOS（Swift/Objective-C）和 Android（Kotlin/Java）原生开发，以及 Flutter 和 React Native 跨平台框架。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch'],
  },

  // ─── 架构类 ───
  'software-architect': {
    type: 'software-architect',
    name: '软件架构师',
    description: '系统设计、领域驱动设计、架构模式和技术决策',
    icon: '🏗️',
    category: 'architecture',
    systemPrompt: '你是一名软件架构专家，精通系统设计、领域驱动设计（DDD）、架构模式（MVC、MVVM、Clean Architecture等）、技术选型和架构决策。能够分析现有系统架构并提出改进建议。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch'],
  },
  'c4-architect': {
    type: 'c4-architect',
    name: 'C4 架构专家',
    description: 'C4 模型架构图、系统上下文图和容器图设计',
    icon: '📐',
    category: 'architecture',
    systemPrompt: '你是一名 C4 架构模型专家，精通 C4 模型的各个层级（Context、Container、Component、Code）。能够创建和分析架构图，帮助团队理解系统结构。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
  },

  // ─── 安全类 ───
  'security-engineer': {
    type: 'security-engineer',
    name: '安全工程师',
    description: '代码安全审计、漏洞检测、安全最佳实践',
    icon: '🔒',
    category: 'security',
    systemPrompt: '你是一名应用安全工程师，精通代码安全审计、OWASP Top 10 漏洞检测、安全编码实践、渗透测试和安全架构设计。能够帮助识别和修复安全漏洞。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch'],
  },
  'security-architect': {
    type: 'security-architect',
    name: '安全架构师',
    description: '安全架构设计、威胁建模、零信任架构',
    icon: '🛡️',
    category: 'security',
    systemPrompt: '你是一名安全架构师，精通安全架构设计、威胁建模（STRIDE）、零信任架构、身份认证与授权、数据加密和安全合规。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
  },

  // ─── DevOps 类 ───
  'devops-automation': {
    type: 'devops-automation',
    name: 'DevOps 自动化专家',
    description: 'CI/CD 流水线、容器化、基础设施即代码',
    icon: '🔄',
    category: 'devops',
    systemPrompt: '你是一名 DevOps 自动化专家，精通 CI/CD 流水线设计（GitHub Actions、GitLab CI、Jenkins）、Docker 容器化、Kubernetes 编排、基础设施即代码（Terraform、Ansible）。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch'],
  },
  'deployment-expert': {
    type: 'deployment-expert',
    name: '部署专家',
    description: '应用部署、发布管理、环境配置和回滚策略',
    icon: '🚀',
    category: 'devops',
    systemPrompt: '你是一名部署专家，精通各种部署策略（蓝绿部署、金丝雀发布、滚动更新）、云平台（AWS、Azure、GCP）、容器编排和发布管理。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
  },
  'site-reliability-engineer': {
    type: 'site-reliability-engineer',
    name: '站点可靠性工程师',
    description: 'SLO/SLI 管理、故障排查、性能优化、可观测性',
    icon: '📊',
    category: 'devops',
    systemPrompt: '你是一名站点可靠性工程师（SRE），精通 SLO/SLI 管理、故障排查、性能优化、可观测性（监控、日志、告警）和容量规划。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
  },

  // ─── 数据类 ───
  'data-analyst': {
    type: 'data-analyst',
    name: '数据分析师',
    description: '数据分析、统计建模、数据可视化、报告生成',
    icon: '📈',
    category: 'data',
    systemPrompt: '你是一名数据分析师，精通数据分析、统计建模、数据可视化（Matplotlib、Seaborn、Plotly）、SQL 查询优化和报告生成。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
  },
  'data-engineer': {
    type: 'data-engineer',
    name: '数据工程师',
    description: '数据管道设计、ETL/ELT、数据仓库、大数据处理',
    icon: '🗄️',
    category: 'data',
    systemPrompt: '你是一名数据工程师，精通数据管道设计、ETL/ELT 流程、数据仓库建模、大数据处理（Spark、Flink）和数据治理。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
  },
  'machine-learning-engineer': {
    type: 'machine-learning-engineer',
    name: '机器学习工程师',
    description: 'ML 模型开发、训练、部署和 MLOps',
    icon: '🤖',
    category: 'data',
    systemPrompt: '你是一名机器学习工程师，精通 ML 模型开发（PyTorch、TensorFlow）、特征工程、模型训练与优化、模型部署和 MLOps 实践。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
  },

  // ─── 设计类 ───
  'ui-designer': {
    type: 'ui-designer',
    name: 'UI 设计师',
    description: '用户界面设计、设计系统、组件库和像素级界面创建',
    icon: '🎯',
    category: 'design',
    systemPrompt: '你是一名 UI 设计师，精通用户界面设计、设计系统构建、组件库开发、响应式设计和无障碍设计。能够创建美观、一致的用户界面。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
  },
  'designer': {
    type: 'designer',
    name: '设计师',
    description: '品牌设计、视觉设计、用户体验设计',
    icon: '✨',
    category: 'design',
    systemPrompt: '你是一名设计师，精通品牌设计、视觉设计、用户体验设计和交互设计。能够帮助创建美观且易用的设计方案。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
  },

  // ─── 测试类 ───
  'qa-engineer': {
    type: 'qa-engineer',
    name: 'QA 测试工程师',
    description: '测试策略、自动化测试、性能测试、测试报告',
    icon: '🧪',
    category: 'testing',
    systemPrompt: '你是一名 QA 测试工程师，精通测试策略制定、自动化测试（单元测试、集成测试、E2E 测试）、性能测试和质量保证流程。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
  },
  'test-engineer': {
    type: 'test-engineer',
    name: '测试工程师',
    description: '测试用例设计、测试执行、Bug 报告和回归测试',
    icon: '🔍',
    category: 'testing',
    systemPrompt: '你是一名测试工程师，精通测试用例设计、测试执行、Bug 报告、回归测试和测试自动化。能够帮助确保软件质量。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
  },

  // ─── 文档类 ───
  'documentation-writer': {
    type: 'documentation-writer',
    name: '文档撰写专家',
    description: '技术文档、API 文档、README 和用户手册编写',
    icon: '📝',
    category: 'documentation',
    systemPrompt: '你是一名技术文档撰写专家，精通技术文档、API 文档、README、用户手册和开发者指南的撰写。能够将复杂的技术概念转化为清晰易懂的文档。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
  },
  'api-documentation': {
    type: 'api-documentation',
    name: 'API 文档专家',
    description: 'OpenAPI/Swagger 规范、API 参考文档和示例代码',
    icon: '📚',
    category: 'documentation',
    systemPrompt: '你是一名 API 文档专家，精通 OpenAPI/Swagger 规范、API 参考文档编写、SDK 文档和示例代码生成。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
  },

  // ─── 其他 ───
  'build-error-resolver': {
    type: 'build-error-resolver',
    name: '构建错误解决专家',
    description: '编译错误诊断、构建配置修复、依赖问题解决',
    icon: '🔨',
    category: 'development',
    systemPrompt: '你是一名构建错误解决专家，精通各种编译器和构建工具（GCC、Clang、MSVC、CMake、Make、Bazel）的错误诊断和修复。能够帮助解决编译错误、链接错误和依赖问题。',
    allowedTools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
  },
  'code-reviewer': {
    type: 'code-reviewer',
    name: '代码审查专家',
    description: '代码质量分析、最佳实践建议、性能优化',
    icon: '👁️',
    category: 'development',
    systemPrompt: '你是一名代码审查专家，精通代码质量分析、设计模式、性能优化、安全编码和最佳实践。能够提供建设性的代码审查意见。',
    allowedTools: ['Bash', 'Read', 'Glob', 'Grep'],
  },
}

/**
 * 获取所有代理能力
 */
export function getAllAgentCapabilities(): AgentCapability[] {
  return Object.values(AGENT_CAPABILITIES)
}

/**
 * 根据类型获取代理能力
 */
export function getAgentCapability(type: string): AgentCapability | undefined {
  return AGENT_CAPABILITIES[type]
}

/**
 * 根据分类获取代理能力
 */
export function getAgentsByCategory(category: AgentCapability['category']): AgentCapability[] {
  return Object.values(AGENT_CAPABILITIES).filter(a => a.category === category)
}

/**
 * 获取所有分类
 */
export function getAllCategories(): AgentCapability['category'][] {
  return ['development', 'architecture', 'security', 'devops', 'data', 'design', 'testing', 'documentation']
}

/**
 * 分类名称映射
 */
export const CATEGORY_NAMES: Record<AgentCapability['category'], string> = {
  development: '开发',
  architecture: '架构',
  security: '安全',
  devops: 'DevOps',
  data: '数据',
  design: '设计',
  testing: '测试',
  documentation: '文档',
}
