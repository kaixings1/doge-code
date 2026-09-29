with open('D:/doge-code/src/components/mcp/MCPStdioServerMenu.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    'server.config.args && server.config.args.length > 0',
    '(server.config.args as any) && (server.config.args as any).length > 0'
)
c = c.replace(
    'server.config.args.join',
    '(server.config.args as any).join'
)

with open('D:/doge-code/src/components/mcp/MCPStdioServerMenu.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
