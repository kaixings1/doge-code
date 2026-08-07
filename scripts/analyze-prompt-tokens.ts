import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

function countTokens(text: string): number {
  // 简单估算：1 字节 ≈ 0.75 token
  return Math.round(text.length * 0.75);
}

// 统计各关键文件
const files = [
  'CLAUDE.md',
  'src/utils/systemPromptSections.ts',
  'src/constants/messages.ts',
  'src/utils/ultraplan/prompt.txt',
];

let total = 0;
console.log('📊 Token 分析:');
for (const file of files) {
  const fullPath = join(process.cwd(), file);
  if (existsSync(fullPath)) {
    const content = readFileSync(fullPath, 'utf-8');
    const tokens = countTokens(content);
    total += tokens;
    console.log(`  ${file}: ${tokens} tokens`);
  } else {
    console.log(`  ${file}: 文件不存在`);
  }
}

// 统计所有 SKILL.md
const skillDir = 'src/skills/bundled';
let skillTotal = 0;
if (existsSync(skillDir)) {
  const skillFiles = readdirSync(skillDir).filter(f => f.endsWith('.md'));
  for (const f of skillFiles) {
    const content = readFileSync(join(skillDir, f), 'utf-8');
    const tokens = countTokens(content);
    skillTotal += tokens;
  }
  console.log(`  所有 SKILL.md 合计：${skillTotal} tokens`);
} else {
  console.log(`  ${skillDir}: 目录不存在`);
}

console.log(`  总计：${total + skillTotal} tokens`);

// 查找最大的提示文件
console.log('\n🔍 最大的提示文件:');
const allMdFiles: { path: string; dir: string; size: number; tokens: number }[] = [];
const allDirs = ['src', '.claude'];
for (const dir of allDirs) {
  if (existsSync(dir)) {
    const mdFiles = readdirSync(dir, { recursive: true })
      .filter(f => f.endsWith('.md'));
    for (const f of mdFiles) {
      const fullPath = join(process.cwd(), dir, f);
      const stat = statSync(fullPath);
      if (stat.size > 100) {
        const content = readFileSync(fullPath, 'utf-8');
        const tokens = countTokens(content);
        allMdFiles.push({
          path: f,
          dir,
          size: stat.size,
          tokens,
        });
      }
    }
  }
}

// 按 token 数排序
allMdFiles.sort((a, b) => b.tokens - a.tokens);
console.log('\n最大的 10 个提示文件:');
for (const { path, dir, size, tokens } of allMdFiles.slice(0, 10)) {
  console.log(`  ${dir}/${path}: ${size} bytes, ${tokens} tokens`);
}

console.log('\n📈 建议：');
console.log('  1. 减少 SKILL.md 数量或压缩内容');
console.log('  2. 使用提示模板系统');
console.log('  3. 实现提示缓存');
