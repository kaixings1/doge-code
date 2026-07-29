// diagnostic-tool 用于打印工具数据结构
const { createAdaptedTools } = require('./toolExecutor');
const config = { provider: 'openai', apiKey: '', model: 'gpt-4o', baseUrl: 'https://api.openai/v1', workingDir: 'D:\\doge-code' };

console.log('=== adaptedTools Map structure ===');
const tools = createAdaptedTools(config);
console.log(`Size: ${tools.size}`);

let count = 0;
for (const [name, tool] of tools.entries()) {
  if (count < 5) {
    console.log(`Tool "${name}":`);
    console.log(`  name: ${JSON.stringify(name)}`);
    console.log(`  tool.name: ${JSON.stringify(tool.name)}`);
    console.log(`  tool.description: ${JSON.stringify(tool.description)}`);
    console.log(`  tool.parameters: ${JSON.stringify(tool.parameters)}`);
    console.log(`  tool.inputSchema: ${JSON.stringify(tool.inputSchema)}`);
    console.log(`  type: ${typeof tool}, is function? ${typeof tool === 'function'}`);
  }
  count++;
}
console.log(`... Total ${count} tools`);
