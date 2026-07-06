const fs = require('fs');
const path = require('path');

const BASE_DIR = "D:/doge-code/.claude/skills";
const OUTPUT_LOG = "D:/doge-code/c_skills_hanshu_log.txt";

const TERM_MAPPING = {
  'schema': '架构', 'slug': '标识符', 'token': '令牌', 'cursor': '游标',
  'endpoint': '端点', 'workflow': '工作流', 'session': '会话', 'query': '查询',
  'filter': '过滤器', 'parameter': '参数', 'argument': '参数', 'response': '响应',
  'request': '请求', 'callback': '回调', 'payload': '载荷', 'handler': '处理器',
  'middleware': '中间件', 'deployment': '部署', 'migration': '迁移', 'integration': '集成',
  'authentication': '认证', 'authorization': '授权', 'configuration': '配置',
  'Quick Reference': '快速参考', 'Operation': '操作', 'Approach': '方法',
  'Prerequisites': '前提条件', 'Setup': '设置', 'Tool Discovery': '工具发现',
  'Core Workflow Patterns': '核心工作流模式', 'Known Pitfalls': '已知陷阱'
};

function getCSkills() {
  const items = fs.readdirSync(BASE_DIR, { withFileTypes: true });
  return items.filter(item => item.isDirectory() && item.name.startsWith('c')).map(item => item.name);
}

function hanshuContent(content, skillName) {
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
    const quickRefTable = '\n\n| 操作 | 方法 |\n|---|---|\n| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |\n| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |\n| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |\n| 处理分页 | 检查响应中的 `cursor` 字段 |\n| 错误处理 | 验证连接状态和架构合规性 |';
    result = result.replace('## 快速参考', '## 快速参考' + quickRefTable);
    changed = true;
  }

  if (/MYMEMORY WARNING/.test(result)) {
    result = result.replace(/MYMEMORY WARNING:.*/g, '').replace(/\|---MYMEMORY WARNING.*/g, '');
    changed = true;
  }

  return { result, changed };
}

function processSkill(skillDir) {
  const filePath = path.join(BASE_DIR, skillDir, 'SKILL.md');
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在', skill: skillDir };
    const content = fs.readFileSync(filePath, 'utf8');
    const { result: hanshuedContent, changed } = hanshuContent(content, skillDir);
    if (!changed) return { success: true, changed: false, skill: skillDir };
    fs.writeFileSync(filePath, hanshuedContent, 'utf8');
    return { success: true, changed: true, skill: skillDir };
  } catch (error) {
    return { success: false, error: error.message, skill: skillDir };
  }
}

async function main() {
  console.log('🚀 开始汉化字母c开头的技能文件...');
  const cSkills = getCSkills();
  console.log(`📊 找到 ${cSkills.length} 个c开头的技能目录`);
  
  const results = { total: cSkills.length, success: 0, failed: 0, changed: 0, unchanged: 0, errors: [] };
  
  for (const skillDir of cSkills) {
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
  console.log(`📊 统计: 总计${results.total} 成功${results.success} 失败${results.failed} 已更新${results.changed} 无变化${results.unchanged}`);
  if (results.errors.length > 0) {
    console.log('❌ 错误:', results.errors.join('\n'));
  }
  const logContent = `\n字母c开头技能汉化报告\n生成时间: ${new Date().toLocaleString()}\n总计: ${results.total}\n成功: ${results.success}\n失败: ${results.failed}\n已更新: ${results.changed}\n无变化: ${results.unchanged}\n${results.errors.length > 0 ? '错误:\n' + results.errors.join('\n') : '无错误'}\n`;
  fs.writeFileSync(OUTPUT_LOG, logContent, 'utf8');
  console.log(`📝 日志: ${OUTPUT_LOG}`);
}

main().catch(error => { console.error('❌ 出错:', error); process.exit(1); });