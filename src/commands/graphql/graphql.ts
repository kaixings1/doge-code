export async function call(args: string, context: any): Promise<string> {
  if (!args || args.trim() === '') {
    return `## graphql

### GraphQL 查询工具

### 端点
- https://api.example.com/graphql
- https://staging-api.example.com/graphql

### 用法
- /graphql query <查询> - 执行GraphQL查询
- /graphql mutate <变更> - 执行GraphQL变更
- /graphql introspect - 获取Schema信息

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

> GraphQL查询工具`
  }

  const parts = args.trim().split(/\s+/)
  const command = parts[0]
  const defaultEndpoint = 'https://api.example.com/graphql'

  if (command === 'query' && parts.length >= 2) {
    const query = parts.slice(1).join(' ')
    try {
      const startTime = Date.now()
      const response = await fetch(defaultEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      })
      const endTime = Date.now()
      const result = await response.json()
      return `## graphql

### GraphQL查询结果

- 端点: ${defaultEndpoint}
- 耗时: ${endTime - startTime}ms
- 状态: ${response.status}

\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\`

> 查询执行完成`
    } catch (error) {
      return `## graphql

### GraphQL查询失败

- 错误: ${error.message}
- 查询: ${query.substring(0, 200)}

> 查询失败`
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
      const response = await fetch(defaultEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: introspectionQuery })
      })
      const result = await response.json()
      const types = result.data?.__schema?.types || []
      const queryType = result.data?.__schema?.queryType?.name || 'Query'
      const mutationType = result.data?.__schema?.mutationType?.name || 'Mutation'
      
      return `## graphql

### Schema自省结果

- 查询根类型: ${queryType}
- 变更根类型: ${mutationType}
- 类型总数: ${types.length}

### 主要类型
${types.slice(0, 20).map(t => `- ${t.name} (${t.kind})`).join('\n')}

> Schema自省完成`
    } catch (error) {
      return `## graphql

### Schema自省失败

- 错误: ${error.message}
- 端点: ${defaultEndpoint}

> 自省失败`
    }
  }

  return `## graphql

### GraphQL查询
- 操作: ${args}

> GraphQL命令已处理`
}
