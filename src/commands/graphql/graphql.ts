import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

interface GraphQLConfig {
  endpoints: Record<string, string>
  defaultEndpoint: string
  headers: Record<string, string>
  timeout: number
}

const DEFAULT_CONFIG: GraphQLConfig = {
  endpoints: {
    'default': 'https://api.example.com/graphql',
    'staging': 'https://staging-api.example.com/graphql',
    'local': 'http://localhost:4000/graphql'
  },
  defaultEndpoint: 'default',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000
}

function loadConfig(cwd: string): GraphQLConfig {
  const configPath = join(cwd, '.doge', 'graphql.json')

  if (existsSync(configPath)) {
    try {
      const userConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
      return { ...DEFAULT_CONFIG, ...userConfig }
    } catch (e) {
      console.error('Failed to load GraphQL config:', e)
    }
  }

  return DEFAULT_CONFIG
}

function saveConfig(cwd: string, config: GraphQLConfig): void {
  const configPath = join(cwd, '.doge', 'graphql.json')
  const dogeDir = join(cwd, '.doge')

  if (!existsSync(dogeDir)) {
    require('fs').mkdirSync(dogeDir, { recursive: true })
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2))
}

async function executeGraphQL(
  endpoint: string,
  query: string,
  headers: Record<string, string>,
  timeout: number
): Promise<any> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

export async function call(args: string, context: any): Promise<string> {
  const cwd = context?.cwd || process.cwd()
  const config = loadConfig(cwd)

  if (!args || args.trim() === '') {
    const endpointsList = Object.entries(config.endpoints)
      .map(([name, url]) => `- ${name}: ${url}${name === config.defaultEndpoint ? ' (默认)' : ''}`)
      .join('\n')

    return `## graphql

### GraphQL 查询工具

### 配置端点
${endpointsList}

### 用法
- /graphql query <查询> - 执行GraphQL查询
- /graphql mutate <变更> - 执行GraphQL变更
- /graphql introspect - 获取Schema信息
- /graphql config set <名称> <URL> - 配置端点
- /graphql config list - 列出所有端点
- /graphql config default <名称> - 设置默认端点

### 示例查询
{
  user(id: "123") {
    name
    email
    posts {
      title
    }
  }
}

### 示例变更
mutation {
  createPost(title: "Hello", content: "World") {
    id
    title
  }
}

### 配置示例
/graphql config set github https://api.github.com/graphql
/graphql config default github
/graphql query "{ viewer { login } }"

> GraphQL查询工具`
  }

  const parts = args.trim().split(/\s+/)
  const command = parts[0]

  // Handle config commands
  if (command === 'config') {
    const subcommand = parts[1]

    if (subcommand === 'set' && parts.length >= 4) {
      const name = parts[2]
      const url = parts[3]

      config.endpoints[name] = url
      saveConfig(cwd, config)

      return `## graphql

### 端点配置已更新

- 名称: ${name}
- URL: ${url}

✓ 端点已保存到配置

> 使用 /graphql config default ${name} 将其设为默认端点`
    }

    if (subcommand === 'list') {
      const endpointsList = Object.entries(config.endpoints)
        .map(([name, url]) => `- ${name}: ${url}${name === config.defaultEndpoint ? ' (默认)' : ''}`)
        .join('\n')

      return `## graphql

### 配置端点列表

${endpointsList}

> 共 ${Object.keys(config.endpoints).length} 个端点`
    }

    if (subcommand === 'default' && parts.length >= 3) {
      const name = parts[2]

      if (!config.endpoints[name]) {
        return `## graphql

### 错误: 端点不存在

- 名称: ${name}

> 请先使用 /graphql config set ${name} <URL> 添加端点`
      }

      config.defaultEndpoint = name
      saveConfig(cwd, config)

      return `## graphql

### 默认端点已更新

✓ 默认端点设置为: ${name}
- URL: ${config.endpoints[name]}

> 默认端点更新成功`
    }

    return `## graphql

### 配置命令用法

- /graphql config set <名称> <URL> - 配置端点
- /graphql config list - 列出所有端点
- /graphql config default <名称> - 设置默认端点

> 配置帮助`
  }

  // Get endpoint for query
  let endpointName = config.defaultEndpoint
  let endpointUrl = config.endpoints[endpointName]

  // Check if user specified an endpoint
  if (parts.length >= 2) {
    const possibleEndpoint = parts[1]
    if (config.endpoints[possibleEndpoint]) {
      endpointName = possibleEndpoint
      endpointUrl = config.endpoints[endpointName]
      // Remove endpoint name from args
      parts.splice(1, 1)
    }
  }

  if (command === 'query' && parts.length >= 2) {
    const query = parts.slice(1).join(' ')
    try {
      const startTime = Date.now()
      const result = await executeGraphQL(endpointUrl, query, config.headers, config.timeout)
      const endTime = Date.now()

      return `## graphql

### GraphQL查询结果

- 端点: ${endpointName} (${endpointUrl})
- 耗时: ${endTime - startTime}ms

\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\`

> 查询执行完成`
    } catch (error: any) {
      return `## graphql

### GraphQL查询失败

- 端点: ${endpointName} (${endpointUrl})
- 错误: ${error.message}
- 查询: ${query.substring(0, 200)}

> 查询失败`
    }
  }

  if (command === 'mutate' && parts.length >= 2) {
    const mutation = parts.slice(1).join(' ')
    try {
      const startTime = Date.now()
      const result = await executeGraphQL(endpointUrl, mutation, config.headers, config.timeout)
      const endTime = Date.now()

      return `## graphql

### GraphQL变更结果

- 端点: ${endpointName} (${endpointUrl})
- 耗时: ${endTime - startTime}ms

\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\`

> 变更执行完成`
    } catch (error: any) {
      return `## graphql

### GraphQL变更失败

- 端点: ${endpointName} (${endpointUrl})
- 错误: ${error.message}
- 变更: ${mutation.substring(0, 200)}

> 变更失败`
    }
  }

  if (command === 'introspect') {
    const introspectionQuery = `
      query IntrospectionQuery {
        __schema {
          types {
            name
            kind
            fields {
              name
            }
          }
          queryType { name }
          mutationType { name }
        }
      }
    `
    try {
      const startTime = Date.now()
      const result = await executeGraphQL(endpointUrl, introspectionQuery, config.headers, config.timeout)
      const endTime = Date.now()

      const types = result.data?.__schema?.types || []
      const queryType = result.data?.__schema?.queryType?.name || 'Query'
      const mutationType = result.data?.__schema?.mutationType?.name || 'Mutation'

      return `## graphql

### Schema自省结果

- 端点: ${endpointName} (${endpointUrl})
- 耗时: ${endTime - startTime}ms
- 查询根类型: ${queryType}
- 变更根类型: ${mutationType}
- 类型总数: ${types.length}

### 主要类型
${types.slice(0, 20).map(t => `- ${t.name} (${t.kind})`).join('\n')}

> Schema自省完成`
    } catch (error: any) {
      return `## graphql

### Schema自省失败

- 端点: ${endpointName} (${endpointUrl})
- 错误: ${error.message}

> 自省失败`
    }
  }

  return `## graphql

### GraphQL命令
- 操作: ${args}
- 当前默认端点: ${endpointName} (${endpointUrl})

> 使用 /graphql config 管理端点配置`
}
