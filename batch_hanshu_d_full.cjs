const fs = require('fs');
const path = require('path');

const BASE_DIR = "D:/doge-code/.claude/skills";
const LOG_FILE = "D:/doge-code/d_full_hanshu_log.txt";

// 通用的英文→中文替换映射（非代码块内）
const replacements = [
  // 章节标题
  [/^## Overview$/gm, '## 概述'],
  [/^## Purpose$/gm, '## 目的'],
  [/^## How It Works$/gm, '## 工作原理'],
  [/^## Features$/gm, '## 功能特性'],
  [/^## Capabilities$/gm, '## 能力范围'],
  [/^## Limitations$/gm, '## 局限性'],
  [/^## Examples$/gm, '## 示例'],
  [/^## Best Practices$/gm, '## 最佳实践'],
  [/^## Troubleshooting$/gm, '## 故障排除'],
  [/^## Anti-Patterns$/gm, '## 反模式'],
  [/^## Checklist$/gm, '## 检查清单'],
  [/^## Output Format$/gm, '## 输出格式'],
  [/^## Response Approach$/gm, '## 响应方法'],
  [/^## Knowledge Base$/gm, '## 知识库'],
  [/^## Behavioral Traits$/gm, '## 行为特征'],
  [/^## Quick Reference$/gm, '## 快速参考'],
  [/^## Core Workflow Patterns$/gm, '## 核心工作流模式'],
  [/^## Known Pitfalls$/gm, '## 已知陷阱'],
  [/^## Tool Discovery$/gm, '## 工具发现'],
  [/^## First-Time Setup$/gm, '## 首次设置'],
  [/^## Key Changes$/gm, '## 关键更改'],
  [/^## Migration Guide$/gm, '## 迁移指南'],
  [/^## Settlement Behavior$/gm, '## 结算行为'],
  [/^## Core Concepts$/gm, '## 核心概念'],
  [/^## Architecture$/gm, '## 架构'],
  [/^## Design$/gm, '## 设计'],

  // 常用英文短语
  ['Use this skill when', '使用此技能的场景'],
  ['Do not use this skill when', '不要使用此技能的场景'],
  ['When to Use', '使用场景'],
  ['When to use', '使用场景'],
  ['Automate operations via Rube MCP', '通过 Rube MCP 自动化操作'],
  ['Always call RUBE_SEARCH_TOOLS first', '始终先调用 RUBE_SEARCH_TOOLS'],
  ['Get the latest tool schema', '获取最新工具架构'],
  ['Rube MCP must be connected', 'Rube MCP 必须已连接'],
  ['Establish an active connection', '建立活跃的连接'],
  ['Check connection status', '检查连接状态'],
  ['This will return available tool slugs, input schemas, recommended execution plan and known pitfalls.', '这将返回可用的工具标识符、输入架构、推荐的执行计划和已知陷阱。'],
  ['No MCP server required', '不需要 MCP 服务器'],
  ['Full read/write access', '完全读写访问权限'],
  ['Requires Google Workspace account', '需要 Google Workspace 账户'],
  ['Personal Gmail accounts are not supported', '不支持个人 Gmail 账户'],

  // ECC 模板
  ['Activate when', '激活时机'],
  ['## Activation Timing', '## 激活时机'],
  ['## Core Principles', '## 核心原则'],
  ['## Getting Started', '## 快速开始'],
  ['## Common Anti-Patterns', '## 常见反模式'],

  // 数据相关
  ['## ETL Pipeline Pattern', '## ETL 管道模式'],
  ['## Data Quality Checks', '## 数据质量检查'],
  ['## Apache Spark Processing', '## Apache Spark 处理'],

  // 设计相关
  ['## Visualization Techniques', '## 可视化技巧'],
  ['## Presentation Templates', '## 演示模板'],
  ['## Writing Techniques', '## 写作技巧'],

  // 方法论
  ['## Story Frameworks', '## 故事框架'],
  ['## Tracing Methodology', '## 追踪方法'],

  // 其他常见标题
  ['## Sources', '## 来源'],
  ['## Sinks', '## 接收器'],
  ['## Data Transformations', '## 数据转换'],
  ['## Methodology', '## 方法论'],
  ['## Workflow', '## 工作流'],
  ['## Commands', '## 命令'],
  ['## Read Commands', '## 读取命令'],
  ['## Write Commands', '## 写入命令'],
];

function loadFile(skillDir) {
  const filePath = path.join(BASE_DIR, skillDir, 'SKILL.md');
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('/n')) return null;
    return content;
  } catch { return null; }
}

function saveFile(skillDir, content) {
  fs.writeFileSync(path.join(BASE_DIR, skillDir, 'SKILL.md'), content, 'utf8');
}

function processSkill(skillDir) {
  const content = loadFile(skillDir);
  if (!content) return { changed: false, reason: '跳过' };

  let result = content;
  let changed = false;

  for (const [from, to] of replacements) {
    // 只替换不在 ``` 代码块中的内容
    const segments = result.split(/(```[\s\S]*?```)/);
    let newResult = '';
    for (let i = 0; i < segments.length; i++) {
      if (i % 2 === 1) {
        // 代码块，不替换
        newResult += segments[i];
      } else {
        // 非代码块内容，替换
        const newSegment = segments[i].replace(from, to);
        if (newSegment !== segments[i]) changed = true;
        newResult += newSegment;
      }
    }
    result = newResult;
  }

  if (changed) saveFile(skillDir, result);
  return { changed, reason: changed ? '已更新' : '无变化' };
}

async function main() {
  const items = fs.readdirSync(BASE_DIR, { withFileTypes: true });
  const dSkills = items.filter(item => item.isDirectory() && item.name.startsWith('d')).map(item => item.name);

  console.log(`🚀 全面深度汉化d开头 ${dSkills.length} 个文件...\n`);
  let updated = 0, unchanged = 0, skipped = 0;

  for (const dir of dSkills) {
    process.stdout.write(`  ${dir}... `);
    const result = processSkill(dir);
    if (result.reason === '跳过') { skipped++; console.log('⏭️'); }
    else if (result.changed) { updated++; console.log('✅'); }
    else { unchanged++; console.log('ℹ️'); }
  }

  console.log(`\n🎉 d开头全面汉化完成！更新${updated} 无变化${unchanged} 跳过${skipped}`);
  const log = `d开头全面深度汉化报告\n生成时间: ${new Date().toLocaleString()}\n总计: ${dSkills.length}\n已更新: ${updated}\n无变化: ${unchanged}\n跳过: ${skipped}\n`;
  fs.writeFileSync(LOG_FILE, log, 'utf8');
}

main().catch(e => console.error('❌ 出错:', e));