const fs = require('fs');
const path = require('path');

const BASE_DIR = "D:/doge-code/.claude/skills";
const LOG_FILE = "D:/doge-code/s_full_hanshu_log.txt";

// 章节标题替换
const sectionMap = {
  'Overview': '概述',
  'When to Use': '使用场景',
  'Use Cases': '使用场景',
  'How It Works': '工作原理',
  'Features': '功能特性',
  'Capabilities': '能力范围',
  'Limitations': '局限性',
  'Examples': '示例',
  'Best Practices': '最佳实践',
  'Troubleshooting': '故障排除',
  'Anti-Patterns': '反模式',
  'AntiPatterns': '反模式',
  'Checklist': '检查清单',
  'Quick Reference': '快速参考',
  'Core Concepts': '核心概念',
  'Getting Started': '快速开始',
  'Design': '设计',
  'Architecture': '架构',
  'Configuration': '配置',
  'Purpose': '目的',
  'Behavior': '行为特征',
  'Knowledge Base': '知识库',
};

// 纯英文标题的文件名 → 中文标题映射
const titleMap = {
  'save': '保存 (Save)',
  'schema': 'Schema 架构',
  'sciomc': 'Sciomc',
  'screenshot': '截图工具',
  'screenshots-marketing': '营销截图',
  'search-first': '搜索优先',
  'security': '安全',
  'security-and-hardening': '安全与加固',
  'scripts': '脚本工具',
  'scaffold-exercises': '练习脚手架',
  'sales-enablement': '销售赋能',
  'santa-method': 'Santa 方法',
  'screenshot-fyi-automation': 'Screenshot-fyi 自动化',
  'screenshotone-automation': 'Screenshotone 自动化',
  'seat-geek-automation': 'Seat-geek 自动化',
  'security-review': '安全审查',
  'security-scan': '安全扫描',
  'security-hardening': '安全加固',
  'segment-analysis': '细分分析',
  'self-improve': '自我改进',
  'semantic-release': '语义化发布',
  'seo': 'SEO 优化',
  'seo-audit': 'SEO 审计',
  'seo-backlinks': 'SEO 外链',
  'seo-cluster': 'SEO 主题集群',
  'seo-content': 'SEO 内容',
  'seo-content-brief': 'SEO 内容简报',
  'seo-dataforseo': 'SEO DataForSEO',
  'seo-drift': 'SEO Drift',
  'seo-ecommerce': 'SEO 电商',
  'seo-flow': 'SEO 流程',
  'seo-geo': 'SEO GEO',
  'seo-google': 'SEO Google',
  'seo-hreflang': 'SEO hreflang',
  'seo-image-gen': 'SEO 图片生成',
  'seo-images': 'SEO 图片',
  'seo-local': 'SEO 本地化',
  'seo-maps': 'SEO 地图',
  'seo-page': 'SEO 页面',
  'seo-plan': 'SEO 计划',
  'seo-programmatic': 'SEO 程序化',
  'seo-schema': 'SEO Schema',
  'seo-sitemap': 'SEO 站点地图',
  'seo-technical': 'SEO 技术',
  'seo-sxo': 'SEO SXO',
  'seo-competitor-pages': 'SEO 竞争对手页面',
  'serverless-arch': '无服务器架构',
  'session-report': '会话报告',
  'setup': '设置向导',
  'setup-matt-pocock-skills': '设置 Matt Pocock 技能',
  'setup-pre-commit': '设置 Pre-commit',
  'shadcn-ui': 'shadcn/ui',
  'shader-dev': '着色器开发',
  'shipping-and-launch': '发布与上线',
  'signup': '注册',
  'signing-entitlements': '签名授权',
  'site-architecture': '网站架构',
  'skill': '技能',
  'skill-creator': '技能创建器',
  'skill-development': '技能开发',
  'skill-stocktake': '技能盘点',
  'skillify': '技能化',
  'slides': '幻灯片',
  'sms': '短信',
  'social': '社交媒体',
  'social-reddit-card': '社交 Reddit 卡片',
  'social-spotify-card': '社交 Spotify 卡片',
  'social-x-post-card': '社交 X 帖子卡片',
  'soft-skill': '软技能',
  'sonarqube-quality': 'SonarQube 质量',
  'sora': 'Sora',
  'source-driven-development': '源码驱动开发',
  'spec-driven-development': '规范驱动开发',
  'spec-workflow': '规范工作流',
  'speech': '语音',
  'statistical-concepts': '统计概念',
  'stitch-loop': 'Stitch 循环',
  'stitch-skill': 'Stitch 技能',
  'strategic-compact': '战略精简',
  'style-guide': '风格指南',
  'styleseed': 'StyleSeed',
  'subagent-driven-development': '子代理驱动开发',
  'summary-statistics': '汇总统计',
  'survival-analysis': '生存分析',
  'sveltekit-framework': 'SvelteKit 框架',
  'swift-actor-persistence': 'Swift Actor 持久化',
  'swift-concurrency-6-2': 'Swift 并发 6.2',
  'swift-protocol-di-testing': 'Swift 协议 DI 测试',
  'swiftpm-macos': 'SwiftPM macOS',
  'swiftui-design': 'SwiftUI 设计',
  'swiftui-patterns': 'SwiftUI 模式',
  'swiss-creative-mode-template': 'Swiss 创意模式模板',
  'swiss-user-research-video-template': 'Swiss 用户研究视频模板',
  'systematic-debugging': '系统性调试',
};

// 常见英文段落
const paragraphMap = [
  [/Rube MCP must be connected/g, 'Rube MCP 必须已连接'],
  [/Establish an active/g, '建立活跃的'],
  [/Always call RUBE_SEARCH_TOOLS first/g, '始终先调用 RUBE_SEARCH_TOOLS'],
  [/Get the latest tool schema/g, '获取最新工具架构'],
  [/This will return available tool slugs, input schemas, recommended execution plan and known pitfalls\./g, '这将返回可用的工具标识符、输入架构、推荐的执行计划和已知陷阱。'],
  [/No MCP server required/g, '不需要 MCP 服务器'],
  [/Full read\/write access/g, '完全读写访问权限'],
  [/Requires Google Workspace account/g, '需要 Google Workspace 账户'],
  [/Personal Gmail accounts are not supported/g, '不支持个人 Gmail 账户'],
  [/Use this skill when/g, '使用此技能的场景'],
  [/Do not use this skill when/g, '不要使用此技能的场景'],
  [/When to use this skill/g, '使用此技能的场景'],
  [/When to Use This Skill/g, '使用此技能的场景'],
  [/Clarify goals, constraints, and required inputs\./g, '明确目标、约束条件和所需输入'],
  [/Apply relevant best practices and validate outcomes\./g, '应用相关最佳实践并验证结果'],
  [/Provide actionable steps and verification\./g, '提供可操作的步骤和验证方法'],
  [/resources\/implementation-playbook\.md/g, 'resources/implementation-playbook.md（实施手册）'],
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

function saveContent(skillDir, content) {
  fs.writeFileSync(path.join(BASE_DIR, skillDir, 'SKILL.md'), content, 'utf8');
}

function processTitle(content, skillDir) {
  // 处理标题
  if (titleMap[skillDir]) {
    const zhTitle = titleMap[skillDir];
    const titleMatch = content.match(/^# .+$/m);
    if (titleMatch) {
      const currentTitle = titleMatch[0];
      // 如果标题不包含中文
      if (!/[\u4e00-\u9fff]/.test(currentTitle)) {
        content = content.replace(currentTitle, `# ${zhTitle}`);
        return { content, changed: true };
      }
    } else {
      // 没有标题行，添加
      content = `# ${zhTitle}\n` + content;
      return { content, changed: true };
    }
  }
  return { content, changed: false };
}

function processSections(content) {
  let changed = false;
  for (const [en, zh] of Object.entries(sectionMap)) {
    const regex = new RegExp(`^## ${en}$`, 'gm');
    const newContent = content.replace(regex, `## ${zh}`);
    if (newContent !== content) { changed = true; content = newContent; }
  }
  return { content, changed };
}

function processParagraphs(content) {
  let changed = false;
  // 分块处理，只替换非代码块内容
  const segments = content.split(/(```[\s\S]*?```)/);
  let newContent = '';
  for (let i = 0; i < segments.length; i++) {
    if (i % 2 === 1) {
      newContent += segments[i]; // 代码块，不替换
    } else {
      let segment = segments[i];
      for (const [from, to] of paragraphMap) {
        const newSegment = segment.replace(from, to);
        if (newSegment !== segment) { changed = true; segment = newSegment; }
      }
      newContent += segment;
    }
  }
  return { content: newContent, changed };
}

function processSkill(skillDir) {
  const raw = loadContent(skillDir);
  if (!raw) return { changed: false, reason: '跳过' };

  let result = raw;
  let changed = false;

  // 1. 处理标题
  const titleResult = processTitle(result, skillDir);
  if (titleResult.changed) { changed = true; result = titleResult.content; }

  // 2. 处理章节
  const sectionResult = processSections(result);
  if (sectionResult.changed) { changed = true; result = sectionResult.content; }

  // 3. 处理段落
  const paraResult = processParagraphs(result);
  if (paraResult.changed) { changed = true; result = paraResult.content; }

  if (changed) saveContent(skillDir, result);
  return { changed, reason: changed ? '已更新' : '无变化' };
}

async function main() {
  const items = fs.readdirSync(BASE_DIR, { withFileTypes: true });
  const sSkills = items.filter(item => item.isDirectory() && item.name.startsWith('s')).map(item => item.name);

  console.log(`🚀 深度汉化s开头 ${sSkills.length} 个文件...\n`);
  let updated = 0, unchanged = 0, skipped = 0;

  for (const dir of sSkills) {
    process.stdout.write(`  ${dir}... `);
    const result = processSkill(dir);
    if (result.reason === '跳过') { skipped++; console.log('⏭️'); }
    else if (result.changed) { updated++; console.log('✅'); }
    else { unchanged++; console.log('ℹ️'); }
  }

  console.log(`\n🎉 s开头汉化完成！更新${updated} 无变化${unchanged} 跳过${skipped}`);
  const log = `s开头深度汉化报告\n生成时间: ${new Date().toLocaleString()}\n总计: ${sSkills.length}\n已更新: ${updated}\n无变化: ${unchanged}\n跳过: ${skipped}\n`;
  fs.writeFileSync(LOG_FILE, log, 'utf8');
}

main().catch(e => console.error('❌ 出错:', e));