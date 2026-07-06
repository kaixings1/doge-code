const fs = require('fs');
const path = require('path');

// 配置
const BASE_DIR = "D:/doge-code/.claude/skills";
const OUTPUT_LOG = "D:/doge-code/a_skills_hanshu_log.txt";

// 术语映射表
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
  
  // 描述性短语
  'Automate operations via Rube MCP': '通过 Rube MCP 自动化操作',
  'Always call RUBE_SEARCH_TOOLS first': '始终先调用 RUBE_SEARCH_TOOLS',
  'Get the latest tool schema': '获取最新工具架构',
  'Rube MCP must be connected': 'Rube MCP 必须已连接',
  'Establish an active connection': '建立活跃的连接',
  'Check connection status': '检查连接状态'
};

// 获取所有a开头的技能目录
function getASkills() {
  const items = fs.readdirSync(BASE_DIR, { withFileTypes: true });
  return items
    .filter(item => item.isDirectory() && item.name.startsWith('a'))
    .map(item => item.name);
}

// 汉化文件内容
function hanshuContent(content, skillName) {
  let result = content;
  
  // 1. 替换术语
  Object.entries(TERM_MAPPING).forEach(([en, zh]) => {
    const regex = new RegExp(`\\b${en}\\b`, 'gi');
    result = result.replace(regex, zh);
  });
  
  // 2. 替换标题中的"通过 Rube MCP 实现 X 自动化"为"X 自动化"
  const titleRegex = /^# 通过 Rube MCP 实现 (.+) 自动化$/m;
  const match = result.match(titleRegex);
  if (match) {
    const serviceName = match[1];
    result = result.replace(titleRegex, `# ${serviceName} 自动化`);
  }
  
  // 3. 确保有标准的快速参考表
  if (result.includes('## 快速参考') && !result.includes('| 操作 | 方法 |')) {
    const quickRefTable = `\n| 操作 | 方法 |\n|---|---|\n| 发现工具 | 调用 \`RUBE_SEARCH_TOOLS\` |\n| 检查连接 | 调用 \`RUBE_MANAGE_CONNECTIONS\` |\n| 执行工具 | 调用 \`RUBE_MULTI_EXECUTE_TOOL\` |\n| 处理分页 | 检查响应中的 \`cursor\` 字段 |\n| 错误处理 | 验证连接状态和架构合规性 |`;
    result = result.replace('## 快速参考', `## 快速参考${quickRefTable}`);
  }
  
  // 4. 移除MYMEMORY警告
  result = result.replace(/MYMEMORY WARNING:.*/g, '');
  result = result.replace(/---MYMEMORY WARNING.*/g, '');
  
  // 5. 确保描述中的服务名首字母大写
  const descMatch = result.match(/description: "通过 Rube MCP \(Composio\) 自动化 (\w+) 操作/);
  if (descMatch) {
    const service = descMatch[1];
    const capitalized = service.charAt(0).toUpperCase() + service.slice(1);
    result = result.replace(new RegExp(`自动化 ${service} 操作`, 'g'), `自动化 ${capitalized} 操作`);
  }
  
  return result;
}

// 处理单个技能文件
function processSkill(skillDir) {
  const skillPath = path.join(BASE_DIR, skillDir);
  const filePath = path.join(skillPath, 'SKILL.md');
  
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在', skill: skillDir };
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const hanshuedContent = hanshuContent(content, skillDir);
    
    // 检查是否有实际变化
    if (content === hanshuedContent) {
      return { success: true, changed: false, skill: skillDir };
    }
    
    fs.writeFileSync(filePath, hanshuedContent, 'utf8');
    return { success: true, changed: true, skill: skillDir };
    
  } catch (error) {
    return { success: false, error: error.message, skill: skillDir };
  }
}

// 主函数
async function main() {
  console.log('🚀 开始汉化字母a开头的技能文件...');
  
  const aSkills = getASkills();
  console.log(`📊 找到 ${aSkills.length} 个a开头的技能目录`);
  
  const results = {
    total: aSkills.length,
    success: 0,
    failed: 0,
    changed: 0,
    unchanged: 0,
    errors: []
  };
  
  // 分批处理，避免内存问题
  const batchSize = 50;
  for (let i = 0; i < aSkills.length; i += batchSize) {
    const batch = aSkills.slice(i, i + batchSize);
    console.log(`\n🔧 处理批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(aSkills.length/batchSize)} (${batch.length}个文件)`);
    
    for (const skillDir of batch) {
      process.stdout.write(`  处理: ${skillDir}... `);
      const result = processSkill(skillDir);
      
      if (result.success) {
        if (result.changed) {
          results.changed++;
          console.log('✅ 已更新');
        } else {
          results.unchanged++;
          console.log('ℹ️  无变化');
        }
        results.success++;
      } else {
        results.failed++;
        results.errors.push(`${skillDir}: ${result.error}`);
        console.log('❌ 失败');
      }
    }
  }
  
  // 输出结果
  console.log('\n' + '='.repeat(50));
  console.log('🎉 汉化完成！');
  console.log('='.repeat(50));
  console.log(`📊 统计结果：`);
  console.log(`   总计: ${results.total} 个技能`);
  console.log(`   成功: ${results.success} 个`);
  console.log(`   失败: ${results.failed} 个`);
  console.log(`   已更新: ${results.changed} 个`);
  console.log(`   无变化: ${results.unchanged} 个`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ 错误列表：');
    results.errors.forEach(error => console.log(`   - ${error}`));
  }
  
  // 保存日志
  const logContent = `
字母a开头技能汉化报告
生成时间: ${new Date().toLocaleString()}
总计技能: ${results.total}
成功处理: ${results.success}
失败处理: ${results.failed}
已更新文件: ${results.changed}
无变化文件: ${results.unchanged}

${results.errors.length > 0 ? '错误列表:\n' + results.errors.join('\n') : '无错误'}
`;
  
  fs.writeFileSync(OUTPUT_LOG, logContent, 'utf8');
  console.log(`\n📝 详细日志已保存到: ${OUTPUT_LOG}`);
}

// 运行主函数
main().catch(error => {
  console.error('❌ 程序执行出错:', error);
  process.exit(1);
});