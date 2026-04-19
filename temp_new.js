/**
 * src 目录英文字符串扫描工具
 * 使用正则表达式检测需要翻译的英文单词和短语
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';

// 获取当前文件信息
const __filename = process.argv[1] || path.join(__dirname, 'src-scan.js');
const __dirname = path.dirname(__filename);

// 目标文件列表（包含子目录）
const targetDirs = [
  'src',
  'src-副本'
];

// 需要翻译的英文术语库 (优先级高的)
const priorityTerms = [
  // 游戏相关
  ['player', '玩家'],
  ['enemy', '敌人'],
  ['bullet', '子弹'],
  ['health', '生命值'],
  ['score', '分数'],
  ['level', '等级'],
  ['gameover', '游戏结束'],

  // 工具相关
  ['debug', '调试'],
  ['console', '控制台'],
  ['log', '日志'],
  ['info', '信息'],
  ['error', '错误'],
  ['warning', '警告'],

  // UI/界面相关
  ['button', '按钮'],
  ['input', '输入框'],
  ['select', '下拉菜单'],
  ['dropdown', '下拉列表'],
  ['modal', '模态对话框'],

  // 网络/协议相关
  ['http', 'HTTP'],
  ['https', 'HTTPS'],
  ['api', 'API'],
  ['json', 'JSON'],
  ['xml', 'XML'],
  ['tcp', 'TCP'],

  // 开发相关
  ['npm', 'NPM'],
  ['git', 'Git'],
  ['python', 'Python'],
  ['javascript', 'JavaScript'],
  ['react', 'React'],
  ['nodejs', 'Node.js'],

  // 其他常见术语
  ['key', '密钥'],
  ['value', '值'],
  ['event', '事件'],
  ['window', '窗口'],
  ['document', '文档'],
  ['iframe', '框架'],
  ['div', 'DIV'],
  ['span', 'SPAN'],
];

// 正则表达式模式列表 (仅 Python)
const pythonPatterns = [
  ['def', '[\s]+', '-', '='],
  ['class', '[\s]+', '('],
];

// JavaScript 导入/导出检测（简单模式）- 仅检测类定义
// (import|require)/,

async function scanPythonFiles() {
  console.log('🔍 扫描 Python 文件...');
  const results = [];

  for (const dir of targetDirs) {
    const filepath = path.join(__dirname, 'src', dir, 'game.py');
    try {
      fs.accessSync(filepath, fs.constants.R_OK);
      const content = fs.readFileSync(filepath, 'utf-8');

      let count = 0;
      for (const pattern of pythonPatterns) {
        if (!pattern[1].startsWith('import')) continue; // skip import lines

        const matches = content.match(pattern);
        if (matches && matches.length > count) {
          const words = matches.slice(count + 1, count + matches.length);
          for (const word of words) {
            if (!isAvoidKeyword(word)) {
              results.push({
                type: 'python_function',
                dir: dir,
                file: filepath.split('/').pop(),
                term: word,
                pattern: pattern[1]
              });
              count++;
            }
          }
        }
      }
    } catch (e) {
      // 文件不存在，继续
    }
  }

  return results;
}

async function scanJavaScriptFiles() {
  console.log('🔍 扫描 JavaScript 文件...');
  const results = [];

  for (const dir of targetDirs) {
    const filepath = path.join(__dirname, 'src', dir, 'index.js');
    try {
      fs.accessSync(filepath, fs.constants.R_OK);
      const content = fs.readFileSync(filepath, 'utf-8');

      let count = 0;
      for (const pattern of patterns) {
        if (!pattern[1].startsWith('import')) continue; // skip import lines

        const matches = content.match(pattern);
        if (matches && matches.length > count) {
          const words = matches.slice(count + 1, count + matches.length);
          for (const word of words) {
            if (!isAvoidKeyword(word)) {
              results.push({
                type: 'javascript_class',
                dir: dir,
                file: filepath.split('/').pop(),
                term: word,
                pattern: pattern[1]
              });
              count++;
            }
          }
        }
      }
    } catch (e) {
      // 文件不存在，继续
    }
  }

  return results;
}
  console.log('🔍 扫描 JavaScript 文件...');
  const results = [];

  for (const dir of targetDirs) {
    const filepath = path.join(__dirname, 'src', dir, 'index.js');
    try {
      fs.accessSync(filepath, fs.constants.R_OK);
      const content = fs.readFileSync(filepath, 'utf-8');

      for (const pattern of patterns) {
        if (!pattern[1].startsWith('import')) continue; // skip import lines

        const matches = content.match(pattern);
        if (matches && matches.length > count) {
          const words = matches.slice(count + 1, count + matches.length);
          for (const word of words) {
            if (!isAvoidKeyword(word)) {
              results.push({
                type: 'javascript_class',
                dir: dir,
                file: filepath.split('/').pop(),
                term: word,
                pattern: pattern[1]
              });
              count++;
            }
          }
        }
      }
    } catch (e) {
      // 文件不存在，继续
    }
  }

  return results;
}

function isAvoidKeyword(word) {
  return ['true', false, ',', ':', ';', '.', '[', ']', '{', '}', '('].includes(word);

async function scanPythonFiles() {
  console.log('🔍 扫描 Python 文件...');
  const results = [];

  for (const dir of targetDirs) {
    const filepath = path.join(__dirname, 'src', dir, 'game.py');
    try {
      fs.accessSync(filepath, fs.constants.R_OK);
      const content = fs.readFileSync(filepath, 'utf-8');

      let count = 0;
      for (const pattern of patterns) {
        if (!pattern[1].startsWith('import')) continue; // skip import lines

        const matches = content.match(pattern);
        if (matches && matches.length > count) {
          const words = matches.slice(count + 1, count + matches.length);
          for (const word of words) {
            if (!isAvoidKeyword(word)) {
              results.push({
                type: 'python_function',
                dir: dir,
                file: filepath.split('/').pop(),
                term: word,
                pattern: pattern[1]
              });
              count++;
            }
          }
        }
      }
    } catch (e) {
      // 文件不存在，继续
    }
  }

  return results;
}

async function scanJavaScriptFiles() {
  console.log('🔍 扫描 JavaScript 文件...');
  const results = [];

  for (const dir of targetDirs) {
    const filepath = path.join(__dirname, 'src', dir, 'index.js');
    try {
      fs.accessSync(filepath, fs.constants.R_OK);
      const content = fs.readFileSync(filepath, 'utf-8');

      let count = 0;
      for (const pattern of patterns) {
        if (!pattern[1].startsWith('import')) continue; // skip import lines

        const matches = content.match(pattern);
        if (matches && matches.length > count) {
          const words = matches.slice(count + 1, count + matches.length);
          for (const word of words) {
            if (!isAvoidKeyword(word)) {
              results.push({
                type: 'javascript_class',
                dir: dir,
                file: filepath.split('/').pop(),
                term: word,
                pattern: pattern[1]
              });
              count++;
            }
          }
        }
      }
    } catch (e) {
      // 文件不存在，继续
    }
  }

  return results;
}

async function scanAll() {
  try {
    console.log('\n========================================');
    console.log('  src 目录英文字符串扫描报告');
    console.log('========================================\n');

    // 扫描 Python 文件
    allResults.push(await scanPythonFiles());

    // 扫描 JavaScript 文件
    allResults.push(await scanJavaScriptFiles());

    // 合并并排序结果
    const uniqueTerms = new Set(allResults.flatMap(r => [r.term]));
    for (const term of uniqueTerms) {
      if (!isAvoidKeyword(term)) {
        const matches = allResults.filter(r => r.term.toLowerCase() === term).map(r =>
          `${r.dir}/${r.file}::${r.type}
  反犬：${term}\n  情击:\r${r.dir}/${path.basename(r.file)}
`);
        translationSuggestions.push(...matches);
      }
    }

    // 按优先级排序
    const sortedTerms = uniqueTerms.sort((a, b) => priorityTerms.filter(p => a.includes(p[0])).length - priorityTerms.filter(p => b.includes(p[0])).length).then(x => x[1]);

    for (const term of sortedTerms) {
      const matches = allResults.filter(r => r.term.toLowerCase() === term);
      if (matches.length > 0) {
        console.log('\u3010${term}】');
        console.log(matches.slice(0, 5).join('\n') || '   ...');
        // 显示翻译建议
        for (const match of matches.slice(5)) {
          console.log(match.split('\n')[1]);
        }
      }
    }

    // 输出翻译建议列表
    if (translationSuggestions.length > 0) {
      const readlineSync = require('readline-sync');
      const answer = readlineSync.question('是否生成完整翻译文件？(y/n): ');
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        generateTranslationFile(targetDirs, translationSuggestions);
      }
    }
  } catch (error) {
    console.error('\u3010扫描错误：${error.message}\u3011');
  }
}

function generateTranslationFile(dirs, terms) {
  let content = '# src 目录翻译建议\n# 生成时间：' + new Date().toLocaleString('zh-CN') + '\n\n';

  for (const dir of dirs) {
    content += '[${dir}/]\n';
    content += '---' + '\n\n';

    const termsInDir = terms.filter(t => t.dir.includes(dir));
    if (termsInDir.length > 0) {
      for (const term of termsInDir) {
        let translations = `翻译建议：${term}\n`;
        for (const [en, zh] of priorityTerms) {
          if (term.includes(en)) {
            const pattern = new RegExp(`\b(${en})\b`, 'i');
            const matches = term.match(pattern);
            if (matches && matches[0].length >= en.length) {
              translations += `${zh}`;
            }
          }
        }
        content += `翻译：${translations}\n`;
      }
    }
  }

  fs.writeFileSync('src-translation-guide.md', content);
}

// 执行扫描
try {
  scanAll();
} catch (err) {
  console.error('\u3010扫描错误：' + err.message + '\u3011');
}
}
