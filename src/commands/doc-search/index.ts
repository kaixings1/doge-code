import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'

const HELP = `Doc Search — 搜索技术文档与 API

用法: /doc-search [选项] [查询词]

选项:
  --tech <name>     搜索特定技术
  --api <name>      搜索 API 符号
  --similar <api>   查找相似 API
  --json            JSON 格式输出
  --help           显示帮助

示例:
  /doc-search SwiftUI
  /doc-search --tech SwiftUI
  /doc-search --api View
  /doc-search --similar URLSession
  /doc-search --json --tech Foundation
`

// ==================== 模拟数据 ====================

interface TechDoc {
  name: string
  category: string
  platforms: string[]
  description: string
  url: string
  tags: string[]
  relatedApis: string[]
}

interface ApiSymbol {
  name: string
  kind: string
  framework: string
  platform: string[]
  abstract: string
  url: string
  since: string
  beta?: boolean
  deprecated?: boolean
}

interface SimilarApi {
  name: string
  url: string
  similarity: number
  reason: string
  category: string
}

const MOCK_TECHS: TechDoc[] = [
  {
    name: 'SwiftUI',
    category: 'User Interfaces',
    platforms: ['iOS 13+', 'macOS 10.15+', 'watchOS 6+', 'tvOS 13+', 'visionOS 1+'],
    description: 'SwiftUI 是 Apple 推出的声明式 UI 框架，使用 Swift 语法构建跨平台用户界面。',
    url: 'https://developer.apple.com/documentation/swiftui',
    tags: ['UI', 'Declarative', 'Cross-Platform'],
    relatedApis: ['View', 'App', 'Scene', 'Observable'],
  },
  {
    name: 'Foundation',
    category: 'Data Management',
    platforms: ['iOS 8+', 'macOS 10.10+', 'watchOS 2+', 'tvOS 9+', 'visionOS 1+'],
    description: 'Foundation 框架提供基础数据管理、日期时间、集合、文件系统等核心功能。',
    url: 'https://developer.apple.com/documentation/foundation',
    tags: ['Core', 'Data', 'Utilities'],
    relatedApis: ['URLSession', 'Codable', 'Date', 'FileManager'],
  },
  {
    name: 'Core Data',
    category: 'Data Management',
    platforms: ['iOS 3+', 'macOS 10.4+', 'watchOS 2+', 'tvOS 9+', 'visionOS 1+'],
    description: 'Core Data 是 Apple 的对象图管理和持久化框架，用于模型数据存储。',
    url: 'https://developer.apple.com/documentation/coredata',
    tags: ['Persistence', 'ORM', 'SQLite'],
    relatedApis: ['NSManagedObject', 'NSFetchRequest', 'NSPersistentContainer'],
  },
  {
    name: 'Swift Concurrency',
    category: 'Concurrency',
    platforms: ['iOS 13+', 'macOS 10.15+', 'watchOS 6+', 'tvOS 13+', 'visionOS 1+'],
    description: 'Swift 并发编程模型，包含 async/await、 actors、结构化并发等现代并发原语。',
    url: 'https://developer.apple.com/documentation/swift/concurrency',
    tags: ['Async', 'Actor', 'Structured Concurrency'],
    relatedApis: ['Task', 'TaskGroup', 'AsyncSequence', 'Sendable'],
  },
  {
    name: 'Combine',
    category: 'Concurrency',
    platforms: ['iOS 13+', 'macOS 10.15+', 'watchOS 6+', 'tvOS 13+', 'visionOS 1+'],
    description: 'Combine 是 Apple 的响应式编程框架，用于处理异步事件流。',
    url: 'https://developer.apple.com/documentation/combine',
    tags: ['Reactive', 'Publishers', 'Subscribers'],
    relatedApis: ['Publisher', 'Subscriber', 'PassthroughSubject', 'CurrentValueSubject'],
  },
  {
    name: 'UIKit',
    category: 'User Interfaces',
    platforms: ['iOS 2+', 'macOS 10.10+ (Mac Catalyst)', 'watchOS 2+', 'tvOS 9+', 'visionOS 1+'],
    description: 'UIKit 是 Apple 经典的基于事件的 UI 框架，用于构建 iOS 和 iPadOS 应用界面。',
    url: 'https://developer.apple.com/documentation/uikit',
    tags: ['UI', 'Event-Driven', 'Legacy'],
    relatedApis: ['UIViewController', 'UIView', 'UITableView', 'UICollectionView'],
  },
]

const MOCK_APIS: ApiSymbol[] = [
  {
    name: 'View',
    kind: 'protocol',
    framework: 'SwiftUI',
    platform: ['iOS 13+', 'macOS 10.15+', 'watchOS 6+', 'tvOS 13+', 'visionOS 1+'],
    abstract: 'View 协议定义 UI 元素的行为，是 SwiftUI 界面的基础构建块。',
    url: 'https://developer.apple.com/documentation/swiftui/view',
    since: 'iOS 13.0',
  },
  {
    name: 'UIViewController',
    kind: 'class',
    framework: 'UIKit',
    platform: ['iOS 2+', 'iPadOS 13+', 'Mac Catalyst 13+', 'tvOS 9+', 'visionOS 1+'],
    abstract: 'UIViewController 管理视图控制器层次结构中的内容。',
    url: 'https://developer.apple.com/documentation/uikit/uiviewcontroller',
    since: 'iOS 2.0',
  },
  {
    name: 'URLSession',
    kind: 'class',
    framework: 'Foundation',
    platform: ['iOS 7+', 'macOS 10.9+', 'watchOS 2+', 'tvOS 9+', 'visionOS 1+'],
    abstract: 'URLSession 和相关的类提供 HTTP/HTTPS 服务下载内容的 API。',
    url: 'https://developer.apple.com/documentation/foundation/urlsession',
    since: 'iOS 7.0',
  },
  {
    name: 'Observable',
    kind: 'macro',
    framework: 'SwiftUI',
    platform: ['iOS 17+', 'macOS 14+', 'watchOS 10+', 'tvOS 17+', 'visionOS 1+'],
    abstract: 'Observable 宏标记一个类型为可观察对象，使 SwiftUI 视图能够自动刷新。',
    url: 'https://developer.apple.com/documentation/swiftui/observable',
    since: 'iOS 17.0',
    beta: false,
  },
  {
    name: 'NSManagedObject',
    kind: 'class',
    framework: 'Core Data',
    platform: ['iOS 3+', 'macOS 10.4+', 'watchOS 2+', 'tvOS 9+', 'visionOS 1+'],
    abstract: 'NSManagedObject 表示 Core Data 中的单个对象。',
    url: 'https://developer.apple.com/documentation/coredata/nsmanagedobject',
    since: 'iOS 3.0',
  },
  {
    name: 'Task',
    kind: 'struct',
    framework: 'Swift Concurrency',
    platform: ['iOS 15+', 'macOS 12+', 'watchOS 8+', 'tvOS 15+', 'visionOS 1+'],
    abstract: 'Task 结构体表示一个并发单元OfWork，可在异步上下文中运行。',
    url: 'https://developer.apple.com/documentation/swift/task',
    since: 'iOS 15.0',
  },
]

const SIMILAR_APIS: Record<string, SimilarApi[]> = {
  'URLSession': [
    { name: 'URLSession.shared', url: 'https://developer.apple.com/documentation/foundation/urlsession/shared', similarity: 9, reason: '共享单例会话', category: 'Networking' },
    { name: 'URLSessionConfiguration', url: 'https://developer.apple.com/documentation/foundation/urlsessionconfiguration', similarity: 8, reason: '配置会话行为', category: 'Networking' },
    { name: 'URLRequest', url: 'https://developer.apple.com/documentation/foundation/urlrequest', similarity: 7, reason: '表示网络请求', category: 'Networking' },
    { name: 'URLResponse', url: 'https://developer.apple.com/documentation/foundation/urlresponse', similarity: 6, reason: '表示响应元数据', category: 'Networking' },
  ],
  'View': [
    { name: 'App', url: 'https://developer.apple.com/documentation/swiftui/app', similarity: 8, reason: '应用入口协议', category: 'Lifecycle' },
    { name: 'Scene', url: 'https://developer.apple.com/documentation/swiftui/scene', similarity: 7, reason: '定义应用场景', category: 'Lifecycle' },
    { name: 'Observable', url: 'https://developer.apple.com/documentation/swiftui/observable', similarity: 6, reason: '可观察对象宏', category: 'State Management' },
  ],
  'UIViewController': [
    { name: 'UIView', url: 'https://developer.apple.com/documentation/uikit/uiview', similarity: 8, reason: '视图基类', category: 'View Hierarchy' },
    { name: 'UINavigationController', url: 'https://developer.apple.com/documentation/uikit/uavigationcontroller', similarity: 7, reason: '导航控制器', category: 'Container' },
    { name: 'UITabBarController', url: 'https://developer.apple.com/documentation/uikit/uitabbarcontroller', similarity: 6, reason: '标签栏控制器', category: 'Container' },
  ],
}

const FRAMEWORK_KEYWORDS: Record<string, string[]> = {
  'SwiftUI': ['View', 'App', 'Scene', 'Observable', 'State', 'Binding'],
  'Foundation': ['URLSession', 'URLRequest', 'Codable', 'Date', 'FileManager', 'NotificationCenter'],
  'Core Data': ['NSManagedObject', 'NSFetchRequest', 'NSPersistentContainer', 'NSManagedObjectContext'],
  'UIKit': ['UIViewController', 'UIView', 'UITableView', 'UICollectionView', 'UIWindow'],
  'Combine': ['Publisher', 'Subscriber', 'PassthroughSubject', 'AnyCancellable'],
  'Swift Concurrency': ['Task', 'TaskGroup', 'AsyncSequence', 'Sendable', 'Actor'],
}

// ==================== 辅助函数 ====================

function formatTechMarkdown(tech: TechDoc): string {
  let md = `# ${tech.name}\n\n`
  md += `**Category:** ${tech.category}\n\n`
  md += `**Platforms:** ${tech.platforms.join(', ')}\n\n`
  md += `**Description:** ${tech.description}\n\n`
  if (tech.tags.length > 0) {
    md += `**Tags:** ${tech.tags.join(', ')}\n\n`
  }
  md += `**Documentation:** [${tech.url}](${tech.url})\n\n`
  if (tech.relatedApis.length > 0) {
    md += `**Related APIs:** ${tech.relatedApis.map(a => `[${a}](https://developer.apple.com/documentation/${tech.name.toLowerCase()}/${a.toLowerCase()})`).join(', ')}\n`
  }
  md += '\n---\n\n[Apple Developer Documentation](https://developer.apple.com/documentation/technologies)'
  return md
}

function formatApiMarkdown(api: ApiSymbol): string {
  let md = `# ${api.name}\n\n`
  md += `**Kind:** ${api.kind}\n\n`
  md += `**Framework:** ${api.framework}\n\n`
  md += `**Platforms:** ${api.platform.join(', ')}\n\n`
  md += `**Available Since:** ${api.since}\n\n`
  md += `**Abstract:** ${api.abstract}\n\n`
  const meta: string[] = []
  if (api.beta) meta.push('Beta')
  if (api.deprecated) meta.push('Deprecated')
  if (meta.length > 0) {
    md += `*Status: ${meta.join(', ')}*\n\n`
  }
  md += `**Documentation:** [${api.url}](${api.url})\n`
  md += '\n---\n\n[Apple Developer Documentation](https://developer.apple.com/documentation)'
  return md
}

function formatSimilarMarkdown(apiName: string, similars: SimilarApi[]): string {
  let md = `# Similar APIs to ${apiName}\n\n`
  md += `Found ${similars.length} similar APIs (sorted by relevance):\n\n`
  for (const api of similars) {
    md += `## [${api.name}](${api.url})\n\n`
    md += `**Similarity:** ${api.similarity}/10\n\n`
    md += `**Reason:** ${api.reason}\n\n`
    md += `**Category:** ${api.category}\n\n`
  }
  md += '---\n\n*Total: ' + similars.length + ' similar APIs found*'
  return md
}

// ==================== 搜索逻辑 ====================

function searchTechs(query: string): TechDoc[] {
  const q = query.toLowerCase()
  return MOCK_TECHS.filter(
    t => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || t.tags.some(tag => tag.toLowerCase().includes(q))
  )
}

function searchApis(query: string): ApiSymbol[] {
  const q = query.toLowerCase()
  return MOCK_APIS.filter(
    a => a.name.toLowerCase().includes(q) || a.framework.toLowerCase().includes(q) || a.kind.toLowerCase().includes(q)
  )
}

function getSimilarApis(apiName: string): SimilarApi[] {
  const key = Object.keys(SIMILAR_APIS).find(k => k.toLowerCase() === apiName.toLowerCase())
  return key ? SIMILAR_APIS[key] : []
}

function listAllTechs(): TechDoc[] {
  return MOCK_TECHS
}

// ==================== 主命令 ====================

const call: LocalCommandCall = async (args) => {
  const raw = (args ?? '').trim()

  if (raw === '--help' || raw === '') {
    return { type: 'text', value: HELP }
  }

  const jsonOutput = raw.includes('--json')
  const techMatch = raw.match(/--tech\s+(\S+)/)
  const apiMatch = raw.match(/--api\s+(\S+)/)
  const similarMatch = raw.match(/--similar\s+(\S+)/)

  // 处理 --similar 模式
  if (similarMatch) {
    const apiName = similarMatch[1]
    const similars = getSimilarApis(apiName)

    if (similars.length === 0) {
      const notFound = {
        error: 'No similar APIs found',
        query: apiName,
        suggestion: 'Try searching with --tech or --api first, or use a known API name like URLSession, View, or UIViewController',
      }
      return { type: 'text', value: jsonOutput ? JSON.stringify(notFound, null, 2) : `# No similar APIs found for "${apiName}"\n\nNo similar APIs found matching "${apiName}".\n\nTry searching with --tech or --api first.` }
    }

    if (jsonOutput) {
      const result = {
        query: apiName,
        total: similars.length,
        apis: similars.map(s => ({
          name: s.name,
          url: s.url,
          similarity: s.similarity,
          reason: s.reason,
          category: s.category,
        })),
      }
      return { type: 'text', value: JSON.stringify(result, null, 2) }
    }

    return { type: 'text', value: formatSimilarMarkdown(apiName, similars) }
  }

  // 处理 --tech 模式
  if (techMatch) {
    const techName = techMatch[1]
    const results = searchTechs(techName)

    if (results.length === 0) {
      const notFound = {
        error: 'No technologies found',
        query: techName,
        availableTechs: MOCK_TECHS.map(t => t.name),
      }
      return { type: 'text', value: jsonOutput ? JSON.stringify(notFound, null, 2) : `# No technologies found for "${techName}"\n\nNo technologies found matching "${techName}".\n\nAvailable technologies: ${MOCK_TECHS.map(t => t.name).join(', ')}` }
    }

    if (jsonOutput) {
      const result = {
        query: techName,
        total: results.length,
        technologies: results.map(t => ({
          name: t.name,
          category: t.category,
          platforms: t.platforms,
          description: t.description,
          url: t.url,
          tags: t.tags,
          relatedApis: t.relatedApis,
        })),
      }
      return { type: 'text', value: JSON.stringify(result, null, 2) }
    }

    return { type: 'text', value: results.map(t => formatTechMarkdown(t)).join('\n\n') }
  }

  // 处理 --api 模式
  if (apiMatch) {
    const apiName = apiMatch[1]
    const results = searchApis(apiName)

    if (results.length === 0) {
      const notFound = {
        error: 'No APIs found',
        query: apiName,
        suggestion: 'Try searching for framework symbols or use a known API name',
      }
      return { type: 'text', value: jsonOutput ? JSON.stringify(notFound, null, 2) : `# No APIs found for "${apiName}"\n\nNo APIs found matching "${apiName}".\n\nTry searching for a known API like View, URLSession, or UIViewController.` }
    }

    if (jsonOutput) {
      const result = {
        query: apiName,
        total: results.length,
        apis: results.map(a => ({
          name: a.name,
          kind: a.kind,
          framework: a.framework,
          platforms: a.platform,
          abstract: a.abstract,
          url: a.url,
          since: a.since,
          beta: a.beta,
          deprecated: a.deprecated,
        })),
      }
      return { type: 'text', value: JSON.stringify(result, null, 2) }
    }

    return { type: 'text', value: results.map(a => formatApiMarkdown(a)).join('\n\n') }
  }

  // 默认：通用搜索（同时搜索技术和 API）
  const techResults = searchTechs(raw)
  const apiResults = searchApis(raw)

  if (techResults.length === 0 && apiResults.length === 0) {
    const notFound = {
      error: 'No results found',
      query: raw,
      suggestion: 'Try searching for SwiftUI, Foundation, UIKit, View, URLSession, etc.',
    }
    return { type: 'text', value: jsonOutput ? JSON.stringify(notFound, null, 2) : `# No results found for "${raw}"\n\nNo technologies or APIs found matching "${raw}".\n\nTry searching for: SwiftUI, Foundation, UIKit, View, URLSession, etc.` }
  }

  if (jsonOutput) {
    const result = {
      query: raw,
      technologies: techResults.map(t => ({
        name: t.name,
        category: t.category,
        platforms: t.platforms,
        description: t.description,
        url: t.url,
      })),
      apis: apiResults.map(a => ({
        name: a.name,
        kind: a.kind,
        framework: a.framework,
        platforms: a.platform,
        abstract: a.abstract,
        url: a.url,
      })),
      total: techResults.length + apiResults.length,
    }
    return { type: 'text', value: JSON.stringify(result, null, 2) }
  }

  let md = ''
  if (techResults.length > 0) {
    md += `# Technologies (${techResults.length})\n\n`
    for (const t of techResults.slice(0, 5)) {
      md += `## [${t.name}](${t.url})\n\n`
      md += `**Category:** ${t.category}\n\n`
      md += `**Platforms:** ${t.platforms.join(', ')}\n\n`
      md += `${t.description}\n\n`
      md += `**Tags:** ${t.tags.join(', ')}\n\n`
    }
  }
  if (apiResults.length > 0) {
    md += `# APIs (${apiResults.length})\n\n`
    for (const a of apiResults.slice(0, 5)) {
      md += `## [${a.name}](${a.url})\n\n`
      md += `**Kind:** ${a.kind} | **Framework:** ${a.framework}\n\n`
      md += `**Platforms:** ${a.platform.join(', ')}\n\n`
      md += `${a.abstract}\n\n`
    }
  }
  return { type: 'text', value: md }
}

const docSearch: Command = {
  type: 'local',
  name: 'doc-search',
  description: '搜索技术文档与 API — 支持 Apple 文档搜索模式',
  aliases: ['doc-search', 'docs'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export { call }
export default docSearch
