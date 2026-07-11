const fs = require('fs');
const path = require('path');
const BASE_DIR = "D:/doge-code/.claude/skills";
const LOG_FILE = "D:/doge-code/w_full_hanshu_log.txt";

const sectionMap = {
  'Overview': '概述', 'When to Use': '使用场景', 'Use Cases': '使用场景',
  'How It Works': '工作原理', 'Features': '功能特性', 'Capabilities': '能力范围',
  'Limitations': '局限性', 'Examples': '示例', 'Best Practices': '最佳实践',
  'Troubleshooting': '故障排除', 'Anti-Patterns': '反模式', 'Checklist': '检查清单',
  'Quick Reference': '快速参考', 'Core Concepts': '核心概念', 'Getting Started': '快速开始',
  'Design': '设计', 'Architecture': '架构', 'Configuration': '配置', 'Purpose': '目的',
};

const titleMap = {
  'wayfinder': '路径查找器 (Wayfinder)',
  'weather-fetcher': '天气获取器',
  'weather-svg-creator': '天气 SVG 创建器',
  'webapp-testing': 'Web 应用测试',
  'web-artifacts-builder': 'Web 产物构建器',
  'webassembly-emscripten': 'WebAssembly Emscripten',
  'web-design-guidelines': '网页设计指南',
  'websocket-realtime': 'WebSocket 实时通信',
  'wiki': 'Wiki',
  'wiki-cli': 'Wiki CLI',
  'wiki-fold': 'Wiki 折叠',
  'wiki-ingest': 'Wiki 导入',
  'wiki-lint': 'Wiki 检查',
  'wiki-mode': 'Wiki 模式',
  'wiki-query': 'Wiki 查询',
  'wiki-retrieve': 'Wiki 检索',
  'window-functions': '窗口函数',
  'window-management': '窗口管理',
  'wizard': '向导',
  'write-report': '写报告',
  'write-sql': '写 SQL',
  'writer-memory': 'Writer 记忆',
  'writing-beats': '写作节拍',
  'writing-fragments': '写作片段',
  'writing-great-skills': '编写优秀技能',
  'writing-plans': '写作计划',
  'writing-rules': '写作规则',
  'writing-shape': '写作形状',
  'writing-skills': '写作技能',
};

const paragraphMap = [
  [/Rube MCP must be connected/g, 'Rube MCP 必须已连接'],
  [/Establish an active/g, '建立活跃的'],
  [/Always call RUBE_SEARCH_TOOLS first/g, '始终先调用 RUBE_SEARCH_TOOLS'],
  [/Get the latest tool schema/g, '获取最新工具架构'],
  [/No MCP server required/g, '不需要 MCP 服务器'],
  [/Full read\/write access/g, '完全读写访问权限'],
  [/Use this skill when/g, '使用此技能的场景'],
  [/Do not use this skill when/g, '不要使用此技能的场景'],
  [/Clarify goals, constraints, and required inputs\./g, '明确目标、约束条件和所需输入'],
  [/Apply relevant best practices and validate outcomes\./g, '应用相关最佳实践并验证结果'],
  [/Provide actionable steps and verification\./g, '提供可操作的步骤和验证方法'],
];

function loadContent(skillDir) {
  try {
    const fp = path.join(BASE_DIR, skillDir, 'SKILL.md');
    if (!fs.existsSync(fp)) return null;
    const content = fs.readFileSync(fp, 'utf8');
    if (content.includes('/n') || content.length < 10) return null;
    return content;
  } catch { return null; }
}

function saveContent(skillDir, content) { fs.writeFileSync(path.join(BASE_DIR, skillDir, 'SKILL.md'), content, 'utf8'); }

function processTitle(content, skillDir) {
  if (titleMap[skillDir]) {
    const zhTitle = titleMap[skillDir];
    const titleMatch = content.match(/^# .+$/m);
    if (titleMatch) {
      if (!/[\u4e00-\u9fff]/.test(titleMatch[0])) {
        content = content.replace(titleMatch[0], `# ${zhTitle}`);
        return { content, changed: true };
      }
    } else {
      content = `# ${zhTitle}\n\n` + content;
      return { content, changed: true };
    }
  }
  return { content, changed: false };
}

function processSections(content) {
  let changed = false;
  for (const [en, zh] of Object.entries(sectionMap)) {
    const r = new RegExp(`^## ${en}$`, 'gm');
    const n = content.replace(r, `## ${zh}`);
    if (n !== content) { changed = true; content = n; }
  }
  return { content, changed };
}

function processParagraphs(content) {
  let changed = false;
  const segments = content.split(/(```[\s\S]*?```)/);
  let r = '';
  for (let i = 0; i < segments.length; i++) {
    if (i % 2 === 1) { r += segments[i]; }
    else {
      let s = segments[i];
      for (const [from, to] of paragraphMap) {
        const n = s.replace(from, to);
        if (n !== s) { changed = true; s = n; }
      }
      r += s;
    }
  }
  return { content: r, changed };
}

function processSkill(skillDir) {
  const raw = loadContent(skillDir);
  if (!raw) return { changed: false, reason: '跳过' };
  let result = raw, changed = false;

  const tr = processTitle(result, skillDir);
  if (tr.changed) { changed = true; result = tr.content; }
  const sr = processSections(result);
  if (sr.changed) { changed = true; result = sr.content; }
  const pr = processParagraphs(result);
  if (pr.changed) { changed = true; result = pr.content; }

  if (changed) saveContent(skillDir, result);
  return { changed, reason: changed ? '已更新' : '无变化' };
}

async function main() {
  const items = fs.readdirSync(BASE_DIR, { withFileTypes: true });
  const wSkills = items.filter(item => item.isDirectory() && item.name.startsWith('w')).map(item => item.name);
  console.log(`🚀 深度汉化w开头 ${wSkills.length} 个文件...\n`);
  let updated = 0, unchanged = 0, skipped = 0;

  for (const dir of wSkills) {
    process.stdout.write(`  ${dir}... `);
    const result = processSkill(dir);
    if (result.reason === '跳过') { skipped++; console.log('⏭️'); }
    else if (result.changed) { updated++; console.log('✅'); }
    else { unchanged++; console.log('ℹ️'); }
  }

  console.log(`\n🎉 w开头汉化完成！更新${updated} 无变化${unchanged} 跳过${skipped}`);
  const log = `w开头深度汉化报告\n生成时间: ${new Date().toLocaleString()}\n总计: ${wSkills.length}\n已更新: ${updated}\n无变化: ${unchanged}\n跳过: ${skipped}\n`;
  fs.writeFileSync(LOG_FILE, log, 'utf8');
}

main().catch(e => console.error('❌ 出错:', e));