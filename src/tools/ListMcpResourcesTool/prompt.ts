export const LIST_MCP_RESOURCES_TOOL_NAME = 'ListMcpResourcesTool'

export const DESCRIPTION = `
列出已配置 MCP 服务器中的可用资源。
每个资源对象包含一个 "server" 字段，指示其所属的服务器。

用法示例：
- 列出所有服务器的全部资源：\`listMcpResources\`
- 列出特定服务器的资源：\`listMcpResources({ server: "myserver" })\`
`

export const PROMPT = `
列出已配置 MCP 服务器中的可用资源。
返回的每个资源将包含所有标准的 MCP 资源字段，外加一个 "server" 字段，
用于指明该资源所属的服务器。

参数：
- server（可选）：要获取资源的特定 MCP 服务器名称。如未提供，将返回所有服务器的资源。
`