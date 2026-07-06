const fs = require('fs');
const path = require('path');

const BASE_DIR = "D:/doge-code/.claude/skills";
const letters = ['h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];

const TERM_MAPPING = {
  'schema': '架构', 'slug': '标识符', 'token': '令牌', 'cursor': '游标',
  'endpoint': '端点', 'workflow': '工作流', 'session': '会话', 'query': '查询',
  'filter': '过滤器', 'parameter': '参数', 'argument': '参数', 'response': '响应',
  'request': '请求', 'callback': '回调', 'payload': '载荷', 'handler': '处理器',
  'middleware': '中间件', 'deployment': '部署', 'migration': '迁移', 'integration': '集成',
  'authentication': '认证', 'authorization': '授权', 'configuration': '配置',
  'Quick Reference': '快速参考', 'Operation': '操作', 'Approach': '方法',
  'Prerequisites': '前提条件', 'Setup': '设置', 'Tool Discovery': '工具发现',
  'Core Workflow Patterns': '核心工作流模式', 'Known Pitfalls': '已知陷阱',
  'Best Practices': '最佳实践', 'When to Use': '使用场景', 'Limitations': '限制',
  'Overview': '概述', 'Purpose': '目的', 'Capabilities': '能力', 'Examples': '示例',
  'Troubleshooting': '故障排除'
};

function getSkillsByLetter(letter) {
  const items = fs.readdirSync(BASE_DIR, { withFileTypes: true });
  return items.filter(item => item.isDirectory() && item.name.startsWith(letter)).map(item => item.name);
}

function hanshuContent(content) {
  let result = content;
  let changed = false;

  Object.entries(TERM_MAPPING).forEach(([en, zh]) => {
    const regex = new RegExp(`\\b${en}\\b`, 'gi');
    const newResult = result.replace(regex, zh);
    if (newResult !== result) { changed = true; result = newResult; }
  });

  const titleRegex = /^# 通过 Rube MCP 实现 (.+) 自动化$/m;
  const match = result.match(titleRegex);
  if (match) {
    result = result.replace(titleRegex, `# ${match[1]} 自动化`);
    changed = true;
  }

  if (result.includes('## 快速参考') && !result.includes('| 操作 | 方法 |')) {
    const tbl = '\n\n| 操作 | 方法 |\n|---|---|\n| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |\n| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |\n| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |\n| 处理分页 | 检查响应中的 `cursor` 字段 |\n| 错误处理 | 验证连接状态和架构合规性 |';
    result = result.replace('## 快速参考', '## 快速参考' + tbl);
    changed = true;
  }

  if (/MYMEMORY WARNING/.test(result)) {
    result = result.replace(/MYMEMORY WARNING:[\s\S]*?(?=\n|$)/g, '').replace(/\|---MYMEMORY WARNING[\s\S]*?(?=\n|$)/g, '');
    changed = true;
  }

  return { result, changed };
}

function processSkill(skillDir) {
  const filePath = path.join(BASE_DIR, skillDir, 'SKILL.md');
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在', skill: skillDir };
    const content = fs.readFileSync(filePath, 'utf8');
    const { result: hanshuedContent, changed } = hanshuContent(content);
    if (!changed) return { success: true, changed: false, skill: skillDir };
    fs.writeFileSync(filePath, hanshuedContent, 'utf8');
    return { success: true, changed: true, skill: skillDir };
  } catch (error) {
    return { success: false, error: error.message, skill: skillDir };
  }
}

async function main() {
  let grandTotal = 0, grandSuccess = 0, grandChanged = 0, grandUnchanged = 0, grandFailed = 0;
  const allErrors = [];

  for (const letter of letters) {
    const skills = getSkillsByLetter(letter);
    if (skills.length === 0) {
      console.log(`\nℹ️  字母 ${letter} 无技能目录，跳过`);
      continue;
    }

    console.log(`\n🚀 开始汉化字母 ${letter} 开头的技能文件...`);
    console.log(`📊 找到 ${skills.length} 个技能目录`);

    let success = 0, failed = 0, changed = 0, unchanged = 0;
    const errors = [];

    for (const skillDir of skills) {
      process.stdout.write(`  ${letter}:${skillDir}... `);
      const result = processSkill(skillDir);
      if (result.success) {
        if (result.changed) { changed++; console.log('✅'); }
        else { unchanged++; console.log('ℹ️'); }
        success++;
      } else {
        failed++; errors.push(`${skillDir}: ${result.error}`);
        console.log('❌');
      }
    }

    console.log(`\n📊 字母 ${letter} 完成: 总计${skills.length} 更新${changed} 无变化${unchanged} 失败${failed}`);
    const logContent = `字母${letter}开头技能汉化报告\n生成时间: ${new Date().toLocaleString()}\n总计: ${skills.length}\n成功: ${success}\n失败: ${failed}\n已更新: ${changed}\n无变化: ${unchanged}\n${errors.length > 0 ? '错误:\n' + errors.join('\n') : '无错误'}\n`;
    fs.writeFileSync(`D:/doge-code/${letter}_skills_hanshu_log.txt`, logContent, 'utf8');

    grandTotal += skills.length; grandSuccess += success; grandChanged += changed;
    grandUnchanged += unchanged; grandFailed += failed; allErrors.push(...errors);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 剩余字母（h-z）全部汉化完成！');
  console.log('='.repeat(60));
  console.log(`📊 总计: ${grandTotal} | 成功: ${grandSuccess} | 失败: ${grandFailed} | 已更新: ${grandChanged} | 无变化: ${grandUnchanged}`);
  if (allErrors.length > 0) console.log('❌ 错误:', allErrors.join('\n'));
}

main().catch(error => { console.error('❌ 出错:', error); process.exit(1); });