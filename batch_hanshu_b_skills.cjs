const fs = require('fs');
const path = require('path');

const BASE_DIR = "D:/doge-code/.claude/skills";
const OUTPUT_LOG = "D:/doge-code/b_skills_hanshu_log.txt";

const TERM_MAPPING = {
  // 技术术语
  'schema': '架构',
  'slug': '标识符',
  'token': '令牌',
  'cursor': '游标',
  'endpoint': '端点',
  'workflow': '工作流',
  'session': '会话',
  'query': '查询',
  'filter': '过滤器',
  'parameter': '参数',
  'argument': '参数',
  'response': '响应',
  'request': '请求',
  'callback': '回调',
  'payload': '载荷',
  'handler': '处理器',
  'middleware': '中间件',
  'deployment': '部署',
  'migration': '迁移',
  'integration': '集成',
  'authentication': '认证',
  'authorization': '授权',
  'configuration': '配置',

  // 标题和章节
  'Quick Reference': '快速参考',
  'Operation': '操作',
  'Approach': '方法',
  'When to Use': '使用场景',
  'Do not use when': '不要使用此技能的场景',
  'Instructions': '使用说明',
  'Resources': '资源',
  'Limitations': '限制',
  'Prerequisites': '前提条件',
  'Setup': '设置',
  'Tool Discovery': '工具发现',
  'Core Workflow Patterns': '核心工作流模式',
  'Known Pitfalls': '已知陷阱',
  'Step 1:': '步骤 1：',
  'Step 2:': '步骤 2：',
  'Step 3:': '步骤 3：',
  'Overview': '概述',
  'Purpose': '目的',
  'Capabilities': '能力',
  'Best Practices': '最佳实践',
  'Examples': '示例',
  'Troubleshooting': '故障排除',

  // 描述性短语
  'Automate operations via Rube MCP': '通过 Rube MCP 自动化操作',
  'Always call RUBE_SEARCH_TOOLS first': '始终先调用 RUBE_SEARCH_TOOLS',
  'Get the latest tool schema': '获取最新工具架构',
  'Rube MCP must be connected': 'Rube MCP 必须已连接',
  'Establish an active connection': '建立活跃的连接',
  'Check connection status': '检查连接状态',
  'Use this skill when': '使用此技能的场景',
  'Do not use this skill when': '不要使用此技能的场景'
};

function getBSkills() {
  const items = fs.readdirSync(BASE_DIR, { withFileTypes: true });
  return items
    .filter(item => item.isDirectory() && item.name.startsWith('b'))
    .map(item => item.name);
}

function hanshuContent(content, skillName) {
  let result = content;
  let changed = false;

  // 1. 替换术语（只替换非代码块内容）
  Object.entries(TERM_MAPPING).forEach(([en, zh]) => {
    if (en === 'schema' || en === 'slug' || en === 'token' || en === 'endpoint' || en === 'workflow' || en === 'session') {
      const regex = new RegExp(`\\b${en}\\b`, 'gi');
      const newResult = result.replace(regex, zh);
      if (newResult !== result) {
        changed = true;
        result = newResult;
      }
    }
  });

  // 2. 替换标题
  const titleRegex = /^# 通过 Rube MCP 实现 (.+) 自动化$/m;
  const match = result.match(titleRegex);
  if (match) {
    const serviceName = match[1];
    result = result.replace(titleRegex, `# ${serviceName} 自动化`);
    changed = true;
  }

  // 3. 替换自动化模板中的英文内容
  const englishPatterns = [
    { from: /\-\s*Rube MCP must be connected/g, to: '- Rube MCP 必须已连接' },
    { from: /\-\s*Establish an active/g, to: '- 通过 `RUBE_MANAGE_CONNECTIONS` 建立活跃的' },
    { from: /\-\s*Always call RUBE_SEARCH_TOOLS first/g, to: '- 始终先调用 `RUBE_SEARCH_TOOLS` 获取当前工具架构' },
    { from: /This will return available tool slugs, input schemas, recommended execution plan and known pitfalls\./g, to: '这将返回可用的工具标识符、输入架构、推荐的执行计划和已知陷阱。' },
    { from: /Get Rube MCP/g, to: '获取 Rube MCP' },
    { from: /Add .* as an MCP server/g, to: '添加为 MCP 服务器' },
    { from: /as an MCP server in your client configuration/g, to: '添加为 MCP 服务器' }
  ];

  englishPatterns.forEach(({ from, to }) => {
    if (from.test(result)) {
      result = result.replace(from, to);
      changed = true;
    }
  });

  // 4. 确保有标准的快速参考表
  if (result.includes('## 快速参考') && !result.includes('| 操作 | 方法 |')) {
    const quickRefTable = '\n\n| 操作 | 方法 |\n|---|---|\n| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |\n| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |\n| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |\n| 处理分页 | 检查响应中的 `cursor` 字段 |\n| 错误处理 | 验证连接状态和架构合规性 |';
    result = result.replace('## 快速参考', '## 快速参考' + quickRefTable);
    changed = true;
  }

  // 5. 移除MYMEMORY警告
  if (/MYMEMORY WARNING/.test(result)) {
    result = result.replace(/MYMEMORY WARNING:.*/g, '');
    result = result.replace(/\|---MYMEMORY WARNING.*/g, '');
    changed = true;
  }

  return { result, changed };
}

function processSkill(skillDir) {
  const filePath = path.join(BASE_DIR, skillDir, 'SKILL.md');
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在', skill: skillDir };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const { result: hanshuedContent, changed } = hanshuContent(content, skillDir);
    if (!changed) {
      return { success: true, changed: false, skill: skillDir };
    }
    fs.writeFileSync(filePath, hanshuedContent, 'utf8');
    return { success: true, changed: true, skill: skillDir };
  } catch (error) {
    return { success: false, error: error.message, skill: skillDir };
  }
}

async function main() {
  console.log('🚀 开始汉化字母b开头的技能文件...');
  const bSkills = getBSkills();
  console.log(`📊 找到 ${bSkills.length} 个b开头的技能目录`);
  
  const results = { total: bSkills.length, success: 0, failed: 0, changed: 0, unchanged: 0, errors: [] };
  
  for (const skillDir of bSkills) {
    process.stdout.write(`  处理: ${skillDir}... `);
    const result = processSkill(skillDir);
    if (result.success) {
      if (result.changed) { results.changed++; console.log('✅ 已更新'); }
      else { results.unchanged++; console.log('ℹ️  无变化'); }
      results.success++;
    } else {
      results.failed++; results.errors.push(`${skillDir}: ${result.error}`);
      console.log('❌ 失败');
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('🎉 汉化完成！');
  console.log('='.repeat(50));
  console.log(`📊 统计结果：\n   总计: ${results.total} 个\n   成功: ${results.success} 个\n   失败: ${results.failed} 个\n   已更新: ${results.changed} 个\n   无变化: ${results.unchanged} 个`);
  if (results.errors.length > 0) {
    console.log('\n❌ 错误列表：');
    results.errors.forEach(error => console.log(`   - ${error}`));
  }

  const logContent = `\n字母b开头技能汉化报告\n生成时间: ${new Date().toLocaleString()}\n总计技能: ${results.total}\n成功处理: ${results.success}\n失败处理: ${results.failed}\n已更新文件: ${results.changed}\n无变化文件: ${results.unchanged}\n\n${results.errors.length > 0 ? '错误列表:\n' + results.errors.join('\n') : '无错误'}\n`;
  fs.writeFileSync(OUTPUT_LOG, logContent, 'utf8');
  console.log(`\n📝 详细日志已保存到: ${OUTPUT_LOG}`);
}

main().catch(error => { console.error('❌ 程序执行出错:', error); process.exit(1); });