const fs = require('fs');
const path = require('path');
const BASE_DIR = "D:/doge-code/.claude/skills";

// 手动映射目录名到中文标题
const titleMap = {
  'accesslint-diff': 'AccessLint Diff 差异检查',
  'accesslint-scan': 'AccessLint 扫描',
  'ai-engineer': 'AI 工程师',
  'algorithmic-art': '算法艺术',
  'azure-search-documents-ts': 'Azure Search (TypeScript)',
  'backend-architect': '后端架构师',
  'backend-development-feature-development': '后端功能开发',
  'backend-security-coder': '后端安全编码',
  'bash-pro': 'Bash 专业版',
  'blockchain-developer': '区块链开发者',
  'brand-guidelines-community': '品牌指南 - 社区版',
  'brand-perception-psychologist': '品牌感知心理学家',
  'branded-types': '品牌化类型',
  'business-analyst': '业务分析师',
  'busybox-on-windows': 'Windows 上的 BusyBox',
  'c-pro': 'C 语言专业版',
  'c4-architecture': 'C4 架构',
  'claude-handoff': 'Claude 交接',
  'cloud-architect': '云架构师',
  'cloudflare-workers-expert': 'Cloudflare Workers 专家',
  'cloudformation-best-practices': 'CloudFormation 最佳实践',
  'compound-metrics': '复合指标',
  'compound-plan': '复合计划',
  'compound-review': '复合审查',
  'comprehensive-review-full-review': '全面审查',
  'content-marketer': '内容营销专家',
  'context-manager': '上下文管理器',
  'cpp-pro': 'C++ 专业版',
  'cqrs-es': 'CQRS 事件溯源',
  'csharp-pro': 'C# 专业版',
  'customer-psychographic-profiler': '消费者心理画像',
  'customer-support': '客户支持',
  'data-report': '数据报告',
  'ddd-patterns': 'DDD 模式',
  'debugger': '调试器',
  'debugging-toolkit-smart-debug': '智能调试工具包',
  'decision-mapping': '决策映射',
  'deck-guizang-editorial': 'Deck 贵藏社论模板',
  'deck-open-slide-canvas': 'Deck 开放幻灯片画布',
  'deck-swiss-international': 'Deck Swiss 国际模板',
  'declare-modules': '声明模块',
  'deno-runtime': 'Deno 运行时',
  'deployment-engineer': '部署工程师',
  'discriminated-unions': '可区分联合类型',
  'django-pro': 'Django 专业版',
  'doc-kami-parchment': 'Doc Kami 羊皮纸模板',
  'docs-architect': '文档架构师',
  'dotnet-architect': '.NET 架构师',
  'dotnet-development': '.NET 开发',
  'edit-article': '编辑文章',
  'elasticsearch-search': 'Elasticsearch 搜索',
  'elixir-pro': 'Elixir 专业版',
  'fix-review': '修复审查',
  'fixing-metadata': '修复元数据',
  'flutter-expert': 'Flutter 专家',
  'frame-data-chart-nyt': '数据图表 NYT 风格',
  'frame-flowchart-sticky': '流程图便签',
  'frame-glitch-title': '故障风格标题',
  'frame-light-leak-cinema': '漏光电影风格',
  'frame-liquid-bg-hero': '液态背景 Hero',
  'frame-logo-outro': 'Logo 结尾动画',
  'frame-macos-notification': 'macOS 通知风格',
  'frontend-developer': '前端开发者',
  'frontend-security-coder': '前端安全编码',
  'full-stack-orchestration-full-stack-feature': '全栈功能编排',
  'generics-advanced': '高级泛型',
  'git-pr-review': 'Git PR 审查',
  'golang-pro': 'Golang 专业版',
  'graphql-architect': 'GraphQL 架构师',
  'grill-me': 'Grill Me 追问',
  'grill-with-docs': '带文档追问',
  'grilling': '追问技巧',
  'kubernetes-architect': 'Kubernetes 架构师',
  'learn': '学习',
  'legacy-modernizer': '遗留系统现代化',
  'legal-advisor': '法律顾问',
  'lesson-generator': '课程生成器',
  'libreoffice': 'LibreOffice',
  'lightning-architecture-review': '闪电架构评审',
  'lightning-channel-factories': '闪电通道工厂',
  'lightning-factory-explainer': '闪电工厂解释器',
  'linear': 'Linear',
  'llmops': 'LLMOps',
  'local-llm-expert': '本地 LLM 专家',
  'loop-me': 'Loop Me',
  'loss-aversion-designer': '损失厌恶设计师',
  'mermaid-expert': 'Mermaid 图表专家',
  'minecraft-bukkit-pro': 'Minecraft Bukkit 专业版',
  'ml-engineer': 'ML 工程师',
  'mlops-engineer': 'MLOps 工程师',
  'mobile-developer': '移动开发者',
  'mobile-security-coder': '移动安全编码',
  'mockup-device-3d': '3D 设备模型',
  'monte-carlo-validation-notebook': 'Monte Carlo 验证笔记本',
  'network-engineer': '网络工程师',
  'plan': '计划',
  'poster-hero': '海报 Hero',
  'ppt-keynote': 'PPT Keynote',
  'prospecting': '销售勘探',
  'prototype': '原型设计',
  'ralph': 'Ralph',
  'request-refactor-plan': '重构计划请求',
  'research': '研究',
  'resolving-merge-conflicts': '解决合并冲突',
  'resume-modern': '现代简历',
  'review': '审查',
  'social-reddit-card': 'Reddit 社交卡片',
  'social-spotify-card': 'Spotify 社交卡片',
  'social-x-post-card': 'X 社交帖子卡片',
  'sveltekit-framework': 'SvelteKit 框架',
  'template-literals': '模板字面量',
  'terraform-iac': 'Terraform IaC',
  'testing-property': '属性测试',
  'ultragoal': 'UltraGoal',
  'ultrawork': 'UltraWork',
  'vfx-text-cursor': 'VFX 文本光标',
  'video-hyperframes': '视频 Hyperframes',
  'visa-doc-translate': '签证文档翻译',
  'visual-verdict': '视觉裁决',
  'zoom-out': 'Zoom Out',
};

let fixed = 0, skipped = 0, errors = 0;

for (const [dir, title] of Object.entries(titleMap)) {
  const fp = path.join(BASE_DIR, dir, 'SKILL.md');
  try {
    if (!fs.existsSync(fp)) { skipped++; continue; }
    let content = fs.readFileSync(fp, 'utf8');
    if (content.includes('/n')) { skipped++; continue; }
    if (content.match(/^# .+/m)) { skipped++; continue; } // 已有标题

    // 在YAML front matter后面插入标题
    const lines = content.split('\n');
    let insertIdx = 0;
    let inYaml = false;
    let yamlEnded = false;
    for (let i = 0; i < lines.length; i++) {
      if (i === 0 && lines[i].trim() === '---') { inYaml = true; }
      else if (inYaml && lines[i].trim() === '---') { inYaml = false; yamlEnded = true; insertIdx = i + 1; }
      else if (yamlEnded && lines[i].trim() !== '') { break; }
      else if (yamlEnded) { insertIdx = i; }
    }

    if (insertIdx > 0) {
      lines.splice(insertIdx, 0, '', `# ${title}`);
      content = lines.join('\n');
      fs.writeFileSync(fp, content, 'utf8');
      fixed++;
      process.stdout.write(`✅ ${dir}\n`);
    } else { skipped++; }
  } catch (e) { errors++; console.log(`❌ ${dir}: ${e.message}`); }
}

console.log(`\n🎉 完成！添加标题: ${fixed}, 跳过: ${skipped}, 错误: ${errors}`);