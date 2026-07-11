const fs = require('fs');
const path = require('path');
const BASE_DIR = "D:/doge-code/.claude/skills";

// 这些文件YAML格式异常，需要重写
const fixes = {
  'wiz-automation': `---
name: wiz-automation
description: "通过 Rube MCP (Composio) 自动执行 Wiz 任务。"
requires:
  mcp: [rube]
---

# Wiz 自动化

通过 Rube MCP 使用 Composio 的 Wiz 工具包自动化 Wiz 操作。

## 前提条件

- Rube MCP 必须已连接
- 建立有效的 Wiz 连接
- 始终先调用 RUBE_SEARCH_TOOLS 获取当前工具架构
`,
  'workday-automation': `---
name: workday-automation
description: "自动执行 Workday 中的人力资源操作。"
requires:
  mcp: [rube]
---

# Workday 自动化

通过 Rube MCP 自动执行 Workday 中的人力资源操作。

## 前提条件

- Rube MCP 已连接
- 建立有效的 Workday 连接
- 始终先调用 RUBE_SEARCH_TOOLS 获取当前工具架构
`,
};

for (const [dir, content] of Object.entries(fixes)) {
  const fp = path.join(BASE_DIR, dir, 'SKILL.md');
  try {
    if (fs.existsSync(fp)) {
      const existing = fs.readFileSync(fp, 'utf8');
      // 只修复YAML格式异常的文件
      if (existing.includes('--- #') || existing.includes("requires: mcp: - rube")) {
        fs.writeFileSync(fp, content, 'utf8');
        console.log(`✅ ${dir} 已修复`);
      } else {
        console.log(`ℹ️ ${dir} 无需修复`);
      }
    }
  } catch (e) {
    console.log(`❌ ${dir}: ${e.message}`);
  }
}

// 其余文件：只在YAML后添加换行
const otherDirs = ['wolfram-alpha-api-automation', 'woodpecker-co-automation',
  'workable-automation', 'workiom-automation', 'worksnaps-automation'];

for (const dir of otherDirs) {
  const fp = path.join(BASE_DIR, dir, 'SKILL.md');
  try {
    if (fs.existsSync(fp)) {
      let content = fs.readFileSync(fp, 'utf8');
      if (content.includes('--- #')) {
        content = content.replace('--- #', '---\n# ');
        fs.writeFileSync(fp, content, 'utf8');
        console.log(`📝 ${dir} 格式已修复`);
      } else {
        console.log(`ℹ️ ${dir} 无需修复`);
      }
    }
  } catch (e) {
    console.log(`❌ ${dir}: ${e.message}`);
  }
}

console.log('\n修复完成');
