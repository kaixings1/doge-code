const mcpToolsearch = {
    type: 'local',
    name: 'mcp-tool-search',
    description: '搜索 MCP 工具',
    argumentHint: '<关键词>',
    load: () => import('./mcpToolsearch.ts'),
};
export default mcpToolsearch;
