/** 搜索结果条目 */
export type SearchResultItem = {
  title: string
  url: string
  description: string
  source?: string
  engine: string
}

/** 搜索引擎定义 */
export type SearchEngine = {
  name: string
  displayName: string
  /** 是否需要 API Key */
  needsKey: boolean
  /** 环境变量名（如果需要 Key） */
  envKey?: string
  /** 搜索函数 */
  search: (query: string, limit: number) => Promise<SearchResultItem[]>
  /** 是否可用（API Key 是否已配置） */
  isAvailable: () => boolean
}
