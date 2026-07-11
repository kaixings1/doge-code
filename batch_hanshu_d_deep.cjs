const fs = require('fs');
const path = require('path');

const BASE_DIR = "D:/doge-code/.claude/skills";
const LOG_FILE = "D:/doge-code/d_deep_hanshu_log.txt";

// 需要深度处理的d开头文件（标题仍是英文的）
const filesToProcess = [
  'data-engineering', 'data-modeling', 'daily-gift',
  'data-engineering-data-driven-feature', 'data-engineering-data-pipeline',
  'data-profiling-report', 'data-quality-frameworks',
  'ddd-patterns', 'debug-buttercup', 'deep-interview',
  'deepinit', 'deep-research', 'defuddle',
  'deployment-engineer', 'deployment-patterns',
  'deployment-pipeline-design', 'deployment-procedures',
  'design-an-interface', 'design-it', 'design-md',
  'design-orchestration', 'design-review', 'design-schema',
  'design-spells', 'design-taste-frontend',
  'detect-outliers', 'deterministic-design',
  'developer-growth-analysis', 'development',
  'diagnosing-bugs', 'diary',
  'differential-review', 'dimensionality-reduction',
  'discriminated-unions', 'dispatching-parallel-agents',
  'distributed-debugging-debug-trace', 'distributed-tracing',
  'distribution-analysis', 'django-access-review',
  'django-patterns', 'django-perf-review', 'django-pro',
  'django-security', 'django-tdd', 'django-verification',
  'doc', 'doc-coauthoring', 'doc2math', 'docx', 'docx-official',
  'doubt-driven-development', 'drizzle-orm-expert',
  'dwarf-expert', 'dx-optimizer'
];

// 中英文标题映射
const titleMap = {
  'data-engineering': '数据工程',
  'data-modeling': '数据建模',
  'data-engineering-data-driven-feature': '数据驱动功能开发',
  'data-engineering-data-pipeline': '数据管道架构',
  'data-profiling-report': '数据画像报告',
  'data-quality-frameworks': '数据质量框架',
  'daily-gift': '每日礼物',
  'ddd-patterns': 'DDD 模式',
  'debug-buttercup': 'Debug Buttercup 调试',
  'deep-interview': '深度面试',
  'deepinit': 'Deep Init',
  'deep-research': '深度研究',
  'defuddle': 'Defuddle',
  'deployment-engineer': '部署工程师',
  'deployment-patterns': '部署模式',
  'deployment-pipeline-design': '部署管道设计',
  'deployment-procedures': '部署流程',
  'design-an-interface': '设计接口',
  'design-it': 'IT 设计',
  'design-md': '设计 MD',
  'design-orchestration': '设计编排',
  'design-review': '设计评审',
  'design-schema': '设计架构',
  'design-spells': '设计技巧',
  'design-taste-frontend': '设计品味 - 前端',
  'detect-outliers': '异常值检测',
  'deterministic-design': '确定性设计',
  'developer-growth-analysis': '开发者成长分析',
  'development': '开发',
  'diagnosing-bugs': '诊断 Bug',
  'diary': '日记',
  'differential-review': '差异评审',
  'dimensionality-reduction': '降维分析',
  'discriminated-unions': '可区分联合',
  'dispatching-parallel-agents': '分发并行代理',
  'distributed-debugging-debug-trace': '分布式调试 - 追踪',
  'distributed-tracing': '分布式追踪',
  'distribution-analysis': '分布分析',
  'django-access-review': 'Django 访问评审',
  'django-patterns': 'Django 模式',
  'django-perf-review': 'Django 性能评审',
  'django-pro': 'Django 专业版',
  'django-security': 'Django 安全',
  'django-tdd': 'Django TDD',
  'django-verification': 'Django 验证',
  'doc': '文档',
  'doc-coauthoring': '文档协作编写',
  'doc2math': '文档转数学',
  'docx': 'DOCX 文档',
  'docx-official': 'DOCX 官方',
  'doubt-driven-development': '疑问驱动开发',
  'drizzle-orm-expert': 'Drizzle ORM 专家',
  'dwarf-expert': 'Dwarf 专家',
  'dx-optimizer': 'DX 优化器'
};

function loadFile(skillDir) {
  const filePath = path.join(BASE_DIR, skillDir, 'SKILL.md');
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    // 检查是否包含异常格式（/n换行）
    if (content.includes('/n')) return null;
    return content;
  } catch {
    return null;
  }
}

function saveFile(skillDir, content) {
  const filePath = path.join(BASE_DIR, skillDir, 'SKILL.md');
  fs.writeFileSync(filePath, content, 'utf8');
}

function processSkill(skillDir) {
  const content = loadFile(skillDir);
  if (!content) return { changed: false, reason: '无法加载' };

  let result = content;
  let changed = false;

  // 1. 替换标题
  const title = titleMap[skillDir];
  if (title) {
    const titleRegex = /^# .+$/m;
    const match = result.match(titleRegex);
    if (match && match[0] !== `# ${title}`) {
      // 只替换如果标题不是中文
      if (!/[\u4e00-\u9fff]/.test(match[0])) {
        result = result.replace(titleRegex, `# ${title}`);
        changed = true;
      }
    }
  }

  // 2. 替换常见英文章节标题
  const sectionReplacements = [
    { from: /^## Overview$/gm, to: '## 概述' },
    { from: /^## Purpose$/gm, to: '## 目的' },
    { from: /^## When to Use$/gm, to: '## 使用场景' },
    { from: /^## Use Cases$/gm, to: '## 使用场景' },
    { from: /^## How It Works$/gm, to: '## 工作原理' },
    { from: /^## Features$/gm, to: '## 功能特性' },
    { from: /^## Capabilities$/gm, to: '## 能力' },
    { from: /^## Instructions$/gm, to: '## 使用说明' },
    { from: /^## Limitations$/gm, to: '## 限制' },
    { from: /^## Examples$/gm, to: '## 示例' },
    { from: /^## Best Practices$/gm, to: '## 最佳实践' },
    { from: /^## Troubleshooting$/gm, to: '## 故障排除' },
    { from: /^## Anti-Patterns$/gm, to: '## 反模式' },
    { from: /^## Checklist$/gm, to: '## 检查清单' },
    { from: /^## Output Format$/gm, to: '## 输出格式' },
    { from: /^## Behavior$/gm, to: '## 行为特征' },
    { from: /^## Prerequisites$/gm, to: '## 前提条件' },
    { from: /^## Setup$/gm, to: '## 设置' },
    { from: /^## Configuration$/gm, to: '## 配置' },
  ];

  sectionReplacements.forEach(({ from, to }) => {
    const newResult = result.replace(from, to);
    if (newResult !== result) { changed = true; result = newResult; }
  });

  // 3. 替换已知陷阱
  if (result.includes('Known Pitfalls')) {
    result = result.replace(/^## Known Pitfalls$/gm, '## 已知陷阱');
    changed = true;
  }

  if (changed) saveFile(skillDir, result);
  return { changed, reason: changed ? '已更新' : '无变化' };
}

async function main() {
  console.log(`🚀 深度处理d开头 ${filesToProcess.length} 个文件...\n`);
  let updated = 0, unchanged = 0, skipped = 0;

  for (const dir of filesToProcess) {
    process.stdout.write(`  ${dir}... `);
    const result = processSkill(dir);
    if (result.reason === '无法加载') { skipped++; console.log('⏭️ 跳过'); }
    else if (result.changed) { updated++; console.log('✅ 已更新'); }
    else { unchanged++; console.log('ℹ️ 无变化'); }
  }

  console.log(`\n🎉 完成！更新${updated} 无变化${unchanged} 跳过${skipped}`);
  const log = `d开头深度汉化报告\n生成时间: ${new Date().toLocaleString()}\n总计: ${filesToProcess.length}\n已更新: ${updated}\n无变化: ${unchanged}\n跳过: ${skipped}\n`;
  fs.writeFileSync(LOG_FILE, log, 'utf8');
}

main().catch(e => console.error('❌ 出错:', e));