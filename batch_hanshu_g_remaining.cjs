const fs = require('fs');
const path = require('path');

const BASE_DIR = "D:/doge-code/.claude/skills";
const OUTPUT_LOG = "D:/doge-code/g_remaining_hanshu_log.txt";

// 已处理的g开头技能（前面User指定的39个）
const alreadyProcessed = new Set([
  'go-concurrency-patterns', 'goal-analyzer', 'godial-automation', 'godot-4-migration', 'godot-gdscript-patterns',
  'golang-idioms', 'golang-patterns', 'golang-pro', 'golang-testing', 'gong-automation', 'goodbits-automation',
  'goody-automation', 'google_admin-automation', 'google_classroom-automation', 'google_maps-automation',
  'google_search_console-automation', 'google-address-validation-automation', 'google-admin-automation',
  'googleads-automation', 'google-analytics-automation', 'googlebigquery-automation', 'googlecalendar-automation',
  'google-calendar-automation', 'google-classroom-automation', 'google-cloud-vision-automation',
  'googledocs-automation', 'google-docs-automation', 'googledrive-automation', 'google-drive-automation',
  'google-maps-automation', 'googlemeet-automation', 'googlephotos-automation', 'google-search-console-automation',
  'googlesheets-automation', 'google-sheets-automation', 'googleslides-automation', 'google-slides-automation',
  'googlesuper-automation', 'googletasks-automation'
]);

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

function processSkill(skillDir) {
  const filePath = path.join(BASE_DIR, skillDir, 'SKILL.md');
  try {
    if (!fs.existsSync(filePath)) return { success: false, error: '文件不存在', skill: skillDir };
    const content = fs.readFileSync(filePath, 'utf8');
    let result = content;
    let changed = false;

    Object.entries(TERM_MAPPING).forEach(([en, zh]) => {
      const regex = new RegExp(`\\b${en}\\b`, 'gi');
      const newResult = result.replace(regex, zh);
      if (newResult !== result) { changed = true; result = newResult; }
    });

    // 替换标题
    const titleRegex = /^# 通过 Rube MCP 实现 (.+) 自动化$/m;
    const match = result.match(titleRegex);
    if (match) {
      result = result.replace(titleRegex, `# ${match[1]} 自动化`);
      changed = true;
    }

    // 快速参考表
    if (result.includes('## 快速参考') && !result.includes('| 操作 | 方法 |')) {
      const tbl = '\n\n| 操作 | 方法 |\n|---|---|\n| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |\n| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |\n| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |\n| 处理分页 | 检查响应中的 `cursor` 字段 |\n| 错误处理 | 验证连接状态和架构合规性 |';
      result = result.replace('## 快速参考', '## 快速参考' + tbl);
      changed = true;
    }

    // 清理MYMEMORY警告
    if (/MYMEMORY WARNING/.test(result)) {
      result = result.replace(/MYMEMORY WARNING:[\s\S]*?(?=\n|$)/g, '').replace(/\|---MYMEMORY WARNING[\s\S]*?(?=\n|$)/g, '');
      changed = true;
    }

    if (changed) fs.writeFileSync(filePath, result, 'utf8');
    return { success: true, changed, skill: skillDir };
  } catch (error) {
    return { success: false, error: error.message, skill: skillDir };
  }
}

async function main() {
  const items = fs.readdirSync(BASE_DIR, { withFileTypes: true });
  const gSkills = items.filter(item => item.isDirectory() && item.name.startsWith('g')).map(item => item.name);
  const remaining = gSkills.filter(s => !alreadyProcessed.has(s));
  
  console.log(`📊 g开头总计: ${gSkills.length}，已处理: ${alreadyProcessed.size}，剩余: ${remaining.length}`);
  
  let changed = 0, unchanged = 0, failed = 0;
  for (const skillDir of remaining) {
    process.stdout.write(`  ${skillDir}... `);
    const result = processSkill(skillDir);
    if (result.success) {
      if (result.changed) { changed++; console.log('✅'); }
      else { unchanged++; console.log('ℹ️'); }
    } else {
      failed++; console.log('❌');
    }
  }

  console.log(`\n🎉 完成！更新${changed} 无变化${unchanged} 失败${failed}`);
  const log = `g开头剩余技能汉化报告\n生成时间: ${new Date().toLocaleString()}\n总计: ${remaining.length}\n已更新: ${changed}\n无变化: ${unchanged}\n失败: ${failed}\n`;
  fs.writeFileSync(OUTPUT_LOG, log, 'utf8');
}

main().catch(error => { console.error('❌ 出错:', error); process.exit(1); });