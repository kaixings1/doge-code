const fs = require('fs');

const filePath = String.raw`D:\doge-code\desktop\src\main\apiClient.ts`;

const oldBlock = '} else {\n' +
  '\t\tconst reqTools = request.tools && request.tools.length > 0\n' +
  '\t\tbody = {\n' +
  '\t\t\tmodel: request.model,\n' +
  '\t\t\tmax_tokens: request.max_tokens,\n' +
  '\t\t\tstream: true,\n' +
  '\t\t\tmessages: request.messages,\n' +
  '\t\t\t...(reqTools ? { tools: request.tools.map(t => ({\n' +
  '\t\t\t\ttype: \'function\',\n' +
  '\t\t\t\tfunction: { name: t.name, description: t.description, parameters: t.input_schema },\n' +
  '\t\t\t}))} : {}),\n' +
  '\t\t\t...(request.temperature ? { temperature: request.temperature } : {}),\n' +
  '\t\t}\n' +
  '\t}';

const newBlock = '} else {\n' +
  '\t\t// OpenAI 兼容格式：先将 Anthropic 格式的 request 转换为 OpenAI 格式\n' +
  '\t\tconst converted = convertAnthropicRequestToOpenAI(request)\n' +
  '\t\tconverted.stream = true\n' +
  '\t\tbody = converted\n' +
  '\t}';

const content = fs.readFileSync(filePath, 'utf-8');
if (!content.includes(oldBlock)) {
  console.error('ERROR: block not found');
  process.exit(1);
}

const updated = content.replace(oldBlock, newBlock);
fs.writeFileSync(filePath, updated, 'utf-8');
console.log('SUCCESS: apiClient.ts fixed');
