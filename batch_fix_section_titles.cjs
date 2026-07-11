const fs = require('fs');
const path = require('path');
const BASE_DIR = "D:/doge-code/.claude/skills";

// 英文→中文的章节标题映射
const sectionMap = {
  'Pre-flight Checks': '预检检查',
  'User Context': '用户上下文',
  'Recent Conversation': '最近对话',
  'Current 查询': '当前查询',
  'Available Agent Tools': '可用代理工具',
  'Client Hierarchy': '客户端层次结构',
  'Client Creation': '客户端创建',
  'Core Patterns': '核心模式',
  'Event Positions': '事件位置',
  'Resource Cleanup': '资源清理',
  'Class Name Changes': '类名变更',
  'Legacy Client Creation': '旧版客户端创建',
  'Legacy Recording': '旧版录制',
  'For New Development': '新开发建议',
  'Migration to Call Automation': '迁移到通话自动化',
  'The Deprecation Decision': '弃用决策',
  'Compulsory vs Advisory Deprecation': '强制性与建议性弃用',
  'The 迁移 Process': '迁移流程',
  'Deprecation Notice: OldService': '弃用通知：旧服务',
  '迁移 Patterns': '迁移模式',
  'Issue Triage': '问题分类',
  'PR Management': 'PR 管理',
  'CI/CD Operations': 'CI/CD 操作',
  'Release Management': '发布管理',
  '安全性 Monitoring': '安全监控',
  'Quality Gate': '质量门禁',
  'Tool 需求': '工具需求',
  'Architecture': '架构',
  'Authentication': '认证',
  'Authorization': '授权',
  'Configuration': '配置',
  'Deployment': '部署',
  'Migration': '迁移',
  'Integration': '集成',
  'Monorepo': '单一仓库',
  '安全性': '安全',
  'Observability': '可观测性',
  'Global Flags': '全局标志',
  '触发短语': '触发短语',
  'Business Context': '业务上下文',
  'Top 3 Quick Wins': '前三快速胜利',
  'Full Opportunity List': '完整机会列表',
  'Recommended Next Step': '推荐下一步',
  'Common Rationalizations to Reject': '常见拒绝理由',
  'Keyword Density and Placement': '关键词密度与位置',
  'Meta Tag Rules': '元标签规则',
  'Information Gain (non-negotiable)': '信息增益（不可协商）',
  'E-E-A-T 需求': 'E-E-A-T 要求',
  'Internal Linking': '内部链接',
  'Sub-skills (load when relevant)': '子技能（按需加载）',
  'Visual assets — generate or source': '视觉资源 — 生成或获取',
  'LLM-assisted work — always annotate model + cost': 'LLM 辅助工作 — 始终标注模型和成本',
  'Algorithm / model explainers — show the equation, annotate the terms': '算法/模型解释 — 展示公式并标注术语',
  'Select-all always has a deselect — no dead-end selections': '全选始终有取消选项 — 无止境选择',
  'After creating or modifying files': '创建或修改文件后',
  'Before modifying existing files': '修改现有文件前',
  'Compliance auditing': '合规审计',
  'Classification': '分类',
  'Install': '安装',
  'Data Collection': '数据收集',
  'Google 的"谁 / 如何 / 为什么"测试（权威启发式方法）': 'Google 的权威启发式测试',
  'The Five Layers of Container 安全性': '容器安全的五层模型',
  'Layer 1: Dockerfile Hardening': '第一层：Dockerfile 加固',
  'Layer 2: Image Scanning': '第二层：镜像扫描',
  'Layer 3: Runtime 安全性': '第三层：运行时安全',
  'Layer 4: Supply Chain 安全性': '第四层：供应链安全',
  'Phase 1 — Build a feedback loop': '阶段 1 — 构建反馈循环',
  'Phase 2 — Reproduce + minimise': '阶段 2 — 复现并最小化',
  'Phase 3 — Hypothesise': '阶段 3 — 提出假设',
  'Phase 4 — Instrument': '阶段 4 — 植入检测',
  'Phase 5 — Fix + regression test': '阶段 5 — 修复并回归测试',
  'Phase 6 — Cleanup + post-mortem': '阶段 6 — 清理并复盘',
  'What This Skill Does': '此技能的功能',
  'What Works Well ✓': '工作良好的部分',
  'Suggestions': '建议',
  'Example — summary, by model, last 7 days': '示例 — 按模型的最近7天摘要',
  'Reporting Guidance': '报告指导',
  'Related': '相关',
  'When NOT to Use This Skill': '不使用此技能的场景',
  'Non-Negotiables': '不可妥协项',
  'Source-First 工作流': '源码优先工作流',
  'Voice Handling': '语音处理',
  'Hard Bans': '严格禁止',
  'Core Capabilities': '核心能力',
  'Use Prerequisites': '使用前提',
  'How to Use': '使用方法',
  'Use Cases': '使用场景',
  'Research Compiled': '研究汇编',
  'The Deprecation Decision': '弃用决策',
  'Why Cross-Component Analysis Matters': '跨组件分析的重要性',
  'Service Topology': '服务拓扑',
  'Network Diagram': '网络图',
  '步骤 1: Map the 架构': '步骤 1：映射架构',
  '步骤 2: Identify Trust Boundaries': '步骤 2：识别信任边界',
  '步骤 3: Find Cross-Component Attack Paths': '步骤 3：查找跨组件攻击路径',
  '步骤 4: Document Attack Chains': '步骤 4：记录攻击链',
  'Attack Chain: [Name]': '攻击链：[名称]',
};

// 收集有unicode编码章节的文件
const unicodeFiles = [];

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // 修复unicode编码的章节标题
    content = content.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
      changed = true;
      return String.fromCharCode(parseInt(hex, 16));
    });

    // 修复英文章节
    for (const [en, zh] of Object.entries(sectionMap)) {
      const regex = new RegExp(`^## ${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'gm');
      const newContent = content.replace(regex, `## ${zh}`);
      if (newContent !== content) {
        changed = true;
        content = newContent;
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

let fixed = 0, total = 0;
const files = fs.readdirSync(BASE_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => path.join(BASE_DIR, d.name, 'SKILL.md'))
  .filter(f => fs.existsSync(f));

for (const file of files) {
  total++;
  if (processFile(file)) {
    fixed++;
    if (fixed <= 20) {
      const dir = path.basename(path.dirname(file));
      console.log(`✅ ${dir}`);
    }
  }
}

console.log(`\n🎉 完成！扫描${total}个文件，修复${fixed}个`);