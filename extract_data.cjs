const fs = require('fs');

// Read both files
const examplesFile = fs.readFileSync('D:/doge-code/src/commands/loop/strategy-examples.ts', 'utf8');
const manualsFile = fs.readFileSync('D:/doge-code/src/commands/loop/strategy-manuals.ts', 'utf8');

// Strip TypeScript syntax and evaluate
function extractData(content, varName) {
  const regex = new RegExp(`export\\s+const\\s+${varName}\\s*:\\s*\\w+\\s*=\\s*`, 'm');
  const match = content.match(regex);
  if (!match) return null;

  const start = match.index + match[0].length;
  const braceStart = content.indexOf('{', start);
  if (braceStart === -1) return null;

  // Find matching closing brace
  let depth = 0;
  let end = braceStart;
  for (let i = braceStart; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }

  let jsCode = content.substring(braceStart, end);

  // Strip TypeScript-specific syntax
  jsCode = jsCode
    .replace(/:\s*\w+(\[\])?\s*=/g, ' =')
    .replace(/:\s*\w+(\[\])?\s*\[\]\s*\[/g, ' [')
    .replace(/:\s*\w+(\[\])?\s*\{/g, ' {')
    .replace(/:\s*string\b/g, '')
    .replace(/:\s*number\b/g, '')
    .replace(/:\s*boolean\b/g, '')
    .replace(/:\s*string\[\]/g, '')
    .replace(/:\s*number\[\]/g, '')
    .replace(/:\s*Record<[^>]+>/g, '')
    .replace(/:\s*\w+\[\]/g, '')
    .replace(/<[\s\S]*?>/g, '')
    .replace(/\s*\|\s*null/g, '')
    .replace(/\s*\|\s*undefined/g, '')
    .replace(/Record<string,\s*unknown>/g, '')
    .replace(/Array<[^>]+>/g, '');

  try {
    return eval('(' + jsCode + ')');
  } catch (e) {
    console.error('Error evaluating:', e.message);
    return null;
  }
}

const examplesData = extractData(examplesFile, 'strategyExamples');
const manualsData = extractData(manualsFile, 'strategyManuals');

let output = '';

output += '════════════════════════════════════════════════════════════════\n';
output += '  Doge Code Loop 策略引擎 - 完整示例与使用指南\n';
output += '  生成日期: ' + new Date().toLocaleString('zh-CN') + '\n';
output += '════════════════════════════════════════════════════════════════\n\n';

// Part 1: Examples
output += '════════════════════════════════════════════════════════════════\n';
output += '  第一部分: 简洁示例列表 (Strategy Examples)\n';
output += '════════════════════════════════════════════════════════════════\n\n';

if (examplesData) {
  for (const [strategy, examples] of Object.entries(examplesData)) {
    output += '────────────────────────────────────────────────────────────────\n';
    output += '  策略: ' + strategy.toUpperCase() + ' (' + examples.length + ' 个示例)\n';
    output += '────────────────────────────────────────────────────────────────\n\n';

    for (let i = 0; i < examples.length; i++) {
      const ex = examples[i];
      output += '  [' + (i + 1) + '] ' + (ex.title || '') + '\n';
      output += '      复杂度: ' + (ex.complexity || '') + '\n';
      output += '      描述: ' + (ex.description || '') + '\n';
      output += '      命令: ' + (ex.command || '') + '\n';
      output += '      策略: ' + (ex.strategy || '') + '\n';
      output += '      结果: ' + (ex.result || '') + '\n';
      if (ex.parameters) {
        output += '      参数:\n';
        for (const p of ex.parameters) {
          output += '        - ' + p + '\n';
        }
      }
      output += '      产出: ' + (ex.outcome || ex.output || '') + '\n';
      output += '\n';
    }
  }
}

// Part 2: Manuals
output += '════════════════════════════════════════════════════════════════\n';
output += '  第二部分: 详细使用手册 (Strategy Manuals)\n';
output += '════════════════════════════════════════════════════════════════\n\n';

if (manualsData) {
  for (const [strategy, manual] of Object.entries(manualsData)) {
    output += '────────────────────────────────────────────────────────────────\n';
    output += '  策略: ' + strategy.toUpperCase() + ' - ' + (manual.displayName || '') + '\n';
    output += '  简介: ' + (manual.tagline || '') + '\n';
    output += '────────────────────────────────────────────────────────────────\n\n';

    if (manual.overview) {
      output += '  ▶ 概述\n';
      output += '    ' + manual.overview.replace(/\n/g, '\n    ') + '\n\n';
    }

    if (manual.useCases) {
      output += '  ▶ 适用场景\n';
      for (const uc of manual.useCases) {
        output += '    ✓ ' + uc + '\n';
      }
      output += '\n';
    }

    if (manual.notSuitableFor) {
      output += '  ▶ 不适用场景\n';
      for (const nsf of manual.notSuitableFor) {
        output += '    ✗ ' + nsf + '\n';
      }
      output += '\n';
    }

    if (manual.coreConcepts) {
      output += '  ▶ 核心概念\n';
      for (const cc of manual.coreConcepts) {
        output += '    • ' + (cc.term || '') + ': ' + (cc.definition || '') + '\n';
      }
      output += '\n';
    }

    if (manual.executionFlow) {
      output += '  ▶ 执行流程\n';
      for (const ef of manual.executionFlow) {
        output += '    ' + ef + '\n';
      }
      output += '\n';
    }

    if (manual.parameters) {
      output += '  ▶ 参数说明\n';
      for (const p of manual.parameters) {
        output += '    • ' + (p.name || '') + ' (' + (p.type || '') + ', 默认: ' + (p.default || '') + '): ' + (p.description || '') + '\n';
      }
      output += '\n';
    }

    if (manual.examples) {
      output += '  ▶ 详细示例 (' + manual.examples.length + ' 个)\n\n';
      for (let i = 0; i < manual.examples.length; i++) {
        const ex = manual.examples[i];
        output += '    [' + (i + 1) + '] ' + (ex.title || '') + ' (' + (ex.complexity || '') + ')\n';
        output += '        场景: ' + (ex.scenario || '') + '\n';
        output += '        命令: ' + (ex.command || '') + '\n';
        output += '        流程:\n';
        for (const f of ex.flow) {
          output += '          - ' + f + '\n';
        }
        output += '        产出: ' + (ex.output || '') + '\n';
        if (ex.tips) {
          output += '        提示:\n';
          for (const t of ex.tips) {
            output += '          • ' + t + '\n';
          }
        }
        output += '\n';
      }
    }

    if (manual.bestPractices) {
      output += '  ▶ 最佳实践\n';
      for (const bp of manual.bestPractices) {
        output += '    ✓ ' + bp + '\n';
      }
      output += '\n';
    }

    if (manual.commonPitfalls) {
      output += '  ▶ 常见陷阱\n';
      for (const cp of manual.commonPitfalls) {
        output += '    ' + cp + '\n';
      }
      output += '\n';
    }

    output += '\n';
  }
}

output += '════════════════════════════════════════════════════════════════\n';
output += '  文档结束\n';
output += '════════════════════════════════════════════════════════════════\n';

fs.writeFileSync('D:/doge-code/loop-strategy-完整示例与使用指南.txt', output, 'utf8');
console.log('文件已生成: D:/doge-code/loop-strategy-完整示例与使用指南.txt');
console.log('总行数: ' + output.split('\n').length);
