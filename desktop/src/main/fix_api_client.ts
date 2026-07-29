import * as fs from 'fs';

const filePath = 'D:\\doge-code\\desktop\\src\\main\\apiClient.ts';
const content = fs.readFileSync(filePath, 'utf-8');

// Find the old block by its unique start and end markers
const startMarker = '} else {\nconst reqTools = request.tools && request.tools.length > 0\nbody = {\nmodel: request.model,';
const endMarker = '...(request.temperature ? { temperature: request.temperature } : {}),\n}\n}';

const startIdx = content.indexOf(startMarker);
if (startIdx === -1) {
  console.error('ERROR: start marker not found');
  process.exit(1);
}

const afterStart = content.substring(startIdx);
const endIdx = afterStart.indexOf(endMarker);
if (endIdx === -1) {
  console.error('ERROR: end marker not found');
  process.exit(1);
}

const endPos = startIdx + endIdx + endMarker.length;
const before = content.substring(0, startIdx);
const after = content.substring(endPos);

// Preserve the original indentation by reading lines around the block
const blockLines = content.substring(startIdx, endPos).split('\n');
const indent = blockLines[0].match(/^\s*/)?.[0] || '';

const replacement =
  indent + '} else {\n' +
  indent + '\t// OpenAI \u517c\u5bb9\u683c\u5f0f\uff1a\u5148\u5c06 Anthropic \u683c\u5f0f\u7684 request \u8f6c\u6362\u4e3a OpenAI \u683c\u5f0f\n' +
  indent + '\tconst converted = convertAnthropicRequestToOpenAI(request)\n' +
  indent + '\tconverted.stream = true\n' +
  indent + '\tbody = converted\n' +
  indent + '}';

fs.writeFileSync(filePath, before + replacement + after, 'utf-8');
console.log('SUCCESS: apiClient.ts fixed');
