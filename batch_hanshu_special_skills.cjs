const fs = require('fs');
const path = require('path');

const BASE_DIR = "D:/doge-code/.claude/skills";

// 数字开头的技能目录（未在之前的脚本中处理）
const specialDirs = ['007', '00-andruia-consultant', '10-andruia-skill-smith', '20-andruia-niche-intelligence', '2slides-ppt-generator', '3d-web-experience', '8-bit-orbit-video-template', 'SPDD'];

const TERM_MAPPING = {
  'schema': '架构', 'slug': '标识符', 'token': '令牌', 'cursor': '游标',
  'endpoint': '端点', 'workflow': '工作流', 'session': '会话', 'query': '查询',
  'filter': '过滤器', 'parameter': '参数', 'argument': '参数', 'response': '响应',
  'request': '请求', 'callback': '回调', 'payload': '载荷', 'handler': '处理器',
  'middleware': '中间件', 'deployment': '部署', 'migration': '迁移', 'integration': '集成',
  'authentication': '认证', 'authorization': '授权', 'configuration': '配置',
  'Quick Reference': '快速参考', 'Operation': '操作', 'Approach': '方法',
  'Prerequisites': '前提条件', 'Setup': '设置', 'Best Practices': '最佳实践',
  'When to Use': '使用场景', 'Limitations': '限制', 'Overview': '概述',
  'Purpose': '目的', 'Capabilities': '能力', 'Examples': '示例',
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
  console.log('🚀 处理特殊开头技能...\n');
  let total = 0, changed = 0, unchanged = 0, failed = 0;

  for (const dir of specialDirs) {
    process.stdout.write(`  处理: ${dir}... `);
    const result = processSkill(dir);
    if (result.success) {
      if (result.changed) { changed++; console.log('✅ 已更新'); }
      else { unchanged++; console.log('ℹ️ 无变化'); }
      total++;
    } else {
      failed++; console.log('❌ 失败');
    }
  }

  console.log(`\n🎉 完成！总计${total} 更新${changed} 无变化${unchanged} 失败${failed}`);
  console.log('📝 日志: D:/doge-code/special_skills_hanshu_log.txt');
  const log = `特殊开头技能汉化报告\n生成时间: ${new Date().toLocaleString()}\n总计: ${total}\n已更新: ${changed}\n无变化: ${unchanged}\n失败: ${failed}\n`;
  fs.writeFileSync('D:/doge-code/special_skills_hanshu_log.txt', log, 'utf8');
}

main().catch(error => { console.error('❌ 出错:', error); process.exit(1); });