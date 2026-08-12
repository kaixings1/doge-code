import type { Command, LocalCommandCall } from '../types/command.js';
import { execFileNoThrow } from '../utils/execFileNoThrow.js';
import { getCwd } from '../utils/cwd.js';
import { isUltrareviewEnabled } from './review/ultrareviewEnabled.js';

// 法务要求显示明确的功能名称以及触发前的文档链接，因此在描述中包含“Web 版 Claude Code”和 URL。
const CCR_TERMS_URL = 'https://code.claude.com/docs/en/claude-code-on-the-web';

/**
 * 解析 PR 编号参数
 */
function parsePrNumber(args: string): number | null {
  const trimmed = args.trim();
  if (!trimmed) return null;
  // 支持 #123 或 123 格式
  const match = trimmed.match(/#?(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * 获取 PR 列表
 */
async function listPrs(): Promise<Array<{ number: number; title: string; state: string; author: string }>> {
  const { stdout, code } = await execFileNoThrow(
    'gh',
    ['pr', 'list', '--json', 'number,title,state,author', '--jq', '.[] | "\(.number)|\(.title)|\(.state)|\(.author.login)"'],
    { preserveOutputOnError: false },
  );
  if (code !== 0 || !stdout.trim()) {
    return [];
  }
  return stdout.trim().split('\n').map(line => {
    const [number, title, state, author] = line.split('|');
    return {
      number: parseInt(number, 10),
      title: title || '',
      state: state || 'unknown',
      author: author || 'unknown',
    };
  });
}

/**
 * 获取 PR 详情
 */
async function getPrDetails(prNumber: number): Promise<{
  number: number;
  title: string;
  body: string;
  state: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  url: string;
} | null> {
  const { stdout, code } = await execFileNoThrow(
    'gh',
    ['pr', 'view', prNumber.toString(), '--json', 'number,title,body,state,author,baseRefName,headRefName,url'],
    { preserveOutputOnError: false },
  );
  if (code !== 0 || !stdout.trim()) {
    return null;
  }
  try {
    const data = JSON.parse(stdout);
    return {
      number: data.number,
      title: data.title,
      body: data.body || '',
      state: data.state,
      author: data.author?.login || 'unknown',
      baseBranch: data.baseRefName,
      headBranch: data.headRefName,
      url: data.url,
    };
  } catch {
    return null;
  }
}

/**
 * 获取 PR diff
 */
async function getPrDiff(prNumber: number): Promise<string> {
  const { stdout, code } = await execFileNoThrow(
    'gh',
    ['pr', 'diff', prNumber.toString()],
    { preserveOutputOnError: false },
  );
  if (code !== 0) {
    return '';
  }
  return stdout;
}

/**
 * 分析 diff 并生成审查报告
 */
/**
 * 检测 diff 中修改的文件类型，返回检测到的语言列表
 */
function detectLanguages(diff: string): string[] {
  const languages = new Set<string>()
  const fileMap: Record<string, string> = {
    '.ts': 'TypeScript', '.tsx': 'TypeScript/React',
    '.js': 'JavaScript', '.jsx': 'JavaScript/React',
    '.py': 'Python', '.rs': 'Rust',
    '.go': 'Go', '.java': 'Java',
    '.kt': 'Kotlin', '.kts': 'Kotlin',
    '.c': 'C', '.cpp': 'C++', '.h': 'C/C++',
    '.cs': 'C#', '.rb': 'Ruby',
    '.php': 'PHP', '.swift': 'Swift',
    '.vue': 'Vue', '.svelte': 'Svelte',
    '.css': 'CSS', '.scss': 'SCSS',
    '.yaml': 'YAML', '.yml': 'YAML',
    '.json': 'JSON', '.md': 'Markdown',
    '.sql': 'SQL', '.sh': 'Shell',
    '.toml': 'TOML',
  }
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/\.([a-z]+)(?=["']?\s|$)/i)
      if (match) {
        const ext = match[0].toLowerCase()
        for (const [key, lang] of Object.entries(fileMap)) {
          if (ext === key) {
            languages.add(lang)
          }
        }
      }
    }
  }
  return [...languages]
}

/**
 * 运行语言特定的静态分析（安全+质量检查）
 */
async function runLocalCodeAnalysis(diff: string): Promise<string[]> {
  const issues: string[] = []
  const languages = detectLanguages(diff)

  for (const lang of languages) {
    if (lang === 'TypeScript' || lang === 'TypeScript/React' || lang === 'JavaScript' || lang === 'JavaScript/React') {
      // 使用 grep 对 diff 中加的代码行进行模式匹配分析
      const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
      for (const line of addedLines) {
        // 安全：eval/Function 动态执行
        if (/eval\s*\(|new\s+Function\s*\(/i.test(line)) {
          issues.push(' 安全: 使用 eval 或动态 Function 构造，存在代码注入风险')
        }
        // 安全：innerHTML/dangerouslySetInnerHTML
        if (/\.innerHTML\s*=|dangerouslySetInnerHTML/i.test(line)) {
          issues.push('🟡 安全: 使用 innerHTML 或 dangerouslySetInnerHTML，可能导致 XSS')
        }
        // 质量：any 类型（TS）
        if (lang.startsWith('TypeScript') && /:\s*any\b/.test(line)) {
          issues.push('🟡 质量: 使用了 any 类型，建议使用更具体的类型')
        }
        // 安全：SQL 注入
        if (/db\.(query|execute|run)\s*\(.*\$\{|\+.*['"]/.test(line)) {
          issues.push(' 安全: 检测到可能的 SQL 注入，请使用参数化查询')
        }
        // 质量：硬编码数字
        if (/return\s+\d+|const\s+\w+\s*=\s*\d{4,}/.test(line)) {
          // 只提示明显的大数字魔法值（不过于敏感）
        }
        // 安全：命令注入
        if (/child_process|exec\s*\(|execSync\s*\(|spawn\s*\(.*\$\{/.test(line)) {
          issues.push(' 安全: 检测到命令执行，注意防范命令注入')
        }
      }
    }

    if (lang === 'Python') {
      const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
      for (const line of addedLines) {
        if (/eval\s*\(|exec\s*\(/i.test(line)) {
          issues.push(' 安全: 使用 eval/exec 动态执行代码，存在注入风险')
        }
        if (/os\.system\s*\(|subprocess\.(call|Popen)\s*\(.*shell\s*=\s*True/i.test(line)) {
          issues.push(' 安全: 检测到 shell=True 的子进程调用，注意命令注入')
        }
        if (/pickle\.loads?/i.test(line)) {
          issues.push('🟡 安全: 使用 pickle 反序列化不可信数据存在风险')
        }
        if (/except\s*:\s*$/m.test(line)) {
          issues.push('🟡 质量: 裸露的 except 子句会捕获所有异常，建议指定异常类型')
        }
      }
    }

    if (lang === 'Rust') {
      const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
      for (const line of addedLines) {
        if (/unsafe\s*\{/.test(line)) {
          issues.push('🟡 安全: 使用了 unsafe 代码块，请仔细检查内存安全性')
        }
        if (/\.unwrap\(\)/.test(line)) {
          issues.push('🟡 质量: 使用 unwrap() 可能导致 panic，建议使用错误处理')
        }
      }
    }

    if (lang === 'Go') {
      const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
      for (const line of addedLines) {
        if (/log\.Fatal|panic\(|os\.Exit/.test(line)) {
          issues.push('🟡 质量: 直接调用 panic 或 os.Exit，考虑返回错误')
        }
        if (/fmt\.Sprintf.*%s.*%s.*%s/.test(line) && line.length > 100) {
          issues.push('🟡 质量: 长 SQL/查询字符串拼接，建议使用参数化查询')
        }
      }
    }
  }

  return [...new Set(issues)]
}

/**
 * 检查类型安全风险：分析 TS/JS 类型相关的常见问题
 */
function checkTypeSafety(diff: string): string[] {
  const issues: string[] = []
  const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
  const allText = addedLines.join('\n')

  // 检查类型断言滥用
  const asAssertions = (allText.match(/as\s+any/g) || []).length
  if (asAssertions > 3) {
    issues.push('🟡 类型安全: 过多使用 "as any" 类型断言 (' + asAssertions + ' 处)，建议使用更精确的类型')
  }

  // 检查非空断言
  const nonNullAssertions = (allText.match(/!\./g) || []).length
  if (nonNullAssertions > 5) {
    issues.push('🟡 类型安全: 过多使用非空断言 (!)，可能导致运行时错误')
  }

  // 检查 @ts-ignore
  const tsIgnores = (allText.match(/@ts-ignore|@ts-expect-error/g) || []).length
  if (tsIgnores > 0) {
    issues.push(' 类型安全: 使用了 ' + tsIgnores + ' 处 @ts-ignore/@ts-expect-error，应修复底层类型问题')
  }

  return issues
}

const LANGUAGE_CHECK_ICONS: Record<string, string> = {
  'TypeScript': '🔷', 'TypeScript/React': '⚛', 'JavaScript': '🟨', 'JavaScript/React': '⚛',
  'Python': '🐍', 'Rust': '🦀', 'Go': '🔵', 'Java': '☕', 'Kotlin': '🏭',
  'C': '⚙', 'C++': '⚙', 'C#': '💠', 'Ruby': '💎',
  'PHP': '🐘', 'Swift': '🍎', 'SQL': '🗄', 'Shell': '🐚',
}

async function generateReviewReport(
  prDetails: Awaited<ReturnType<typeof getPrDetails>>,
  diff: string,
): string {
  if (!prDetails) {
    return '无法获取 PR 详情';
  }
  const lines = diff.split('\n');
  const stats = {
    filesChanged: 0,
    additions: 0,
    deletions: 0,
  };
  const changedFiles: string[] = [];
  // 解析 diff 统计
  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      stats.filesChanged++;
      const match = line.match(/b\/(.+)/);
      if (match) changedFiles.push(match[1]);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      stats.additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      stats.deletions++;
    }
  }

  const languages = detectLanguages(diff);
  const langNames = languages.map(l => LANGUAGE_CHECK_ICONS[l] ? LANGUAGE_CHECK_ICONS[l] + ' ' + l : l).join(', ') || '未检测';

  let report = `# PR 审查报告
## PR 信息
| 属性 | 值 |
|------|-----|
| 编号 | #${prDetails.number} |
| 标题 | ${prDetails.title} |
| 状态 | ${prDetails.state} |
| 作者 | ${prDetails.author} |
| 基础分支 | ${prDetails.baseBranch} |
| 目标分支 | ${prDetails.headBranch} |
| URL | ${prDetails.url} |
## 变更统计
- 文件变更: ${stats.filesChanged}
- 新增行: +${stats.additions}
- 删除行: -${stats.deletions}
- 检测语言: ${langNames}
## PR 描述
${prDetails.body || '*无描述*'}
## 代码审查

`;
  // 基本检查
  const checks: Array<{ name: string; passed: boolean; message: string }> = [];
  // 检查是否有测试文件变更
  const hasTestChanges = diff.includes('test') || diff.includes('spec') || diff.includes('__tests__');
  checks.push({
    name: '测试覆盖',
    passed: hasTestChanges,
    message: hasTestChanges ? ' 包含测试变更' : ' 未检测到测试文件变更，建议添加测试',
  });
  // 检查是否有文档变更
  const hasDocChanges = diff.includes('.md') || diff.includes('docs/');
  checks.push({
    name: '文档更新',
    passed: hasDocChanges,
    message: hasDocChanges ? ' 包含文档更新' : 'ℹ 未检测到文档变更',
  });
  // 检查 TODO/FIXME
  const todoMatch = diff.match(/\/\/\s*TODO|#\s*TODO|\/\*\s*TODO|FIXME/i);
  if (todoMatch) {
    checks.push({
      name: '待办事项',
      passed: false,
      message: ' 代码中包含 TODO/FIXME 注释，请在合并前处理',
    });
  }
  // 检查 console.log/debugger
  const debugMatch = diff.match(/console\.(log|debug|info|warn|error)|debugger|print\(/i);
  if (debugMatch) {
    checks.push({
      name: '调试代码',
      passed: false,
      message: ' 包含调试语句 (console.log/debugger/print)，请在生产代码中移除',
    });
  }
  // 检查敏感信息
  const secretMatch = diff.match(/(?<![\w])password(?:_\w+)?\s*[:=]\s*['"][^'"]+['"]|secret(?:_\w+)?\s*[:=]\s*['"][^'"]+['"]|api[_-]key\s*[:=]\s*['"][^'"]+['"]|token\s*[:=]\s*['"][^'"]+['"]/i);
  if (secretMatch) {
    checks.push({
      name: '敏感信息',
      passed: false,
      message: ' 检测到硬编码的凭据（密码/密钥/令牌），禁止提交到仓库！',
    });
  }
  // 检查大文件变更
  if (stats.additions > 1000) {
    checks.push({
      name: 'PR 大小',
      passed: false,
      message: ' 变更较大（+' + stats.additions + ' 行），建议拆分为多个小 PR',
    });
  }
  // 检查是否有二进制文件
  const binaryFiles = changedFiles.filter(f => /\.(png|jpg|jpeg|gif|ico|svg|pdf|zip|tar|gz|exe|dll|so|dylib|class)$/i.test(f));
  if (binaryFiles.length > 0) {
    checks.push({
      name: '二进制文件',
      passed: false,
      message: ' 包含 ' + binaryFiles.length + ' 个二进制文件变更（' + binaryFiles.join(', ') + '），确认是否需要',
    });
  }

  report += '### 自动检查\n\n';
  for (const check of checks) {
    report += '- ' + check.message + '\n';
  }

  // 语言特定的静态分析
  report += '\n### 语言特定分析\n\n';
  report += '检测语言: ' + langNames + '\n\n';

  // 运行本地代码分析（同步）
  const analysisResults = await runLocalCodeAnalysis(diff);
  if (analysisResults.length > 0) {
    for (const issue of analysisResults) {
      report += '- ' + issue + '\n';
    }
  } else {
    report += ' 未检测到常见安全问题或代码异味\n';
  }

  // 类型安全分析
  if (languages.some(l => l.startsWith('TypeScript') || l === 'JavaScript')) {
    const typeIssues = checkTypeSafety(diff);
    if (typeIssues.length > 0) {
      report += '\n### 类型安全\n\n';
      for (const issue of typeIssues) {
        report += '- ' + issue + '\n';
      }
    }
  }

  report += `
## 审查要点

请人工审查以下方面：
1. **代码正确性**: 逻辑是否正确，边界条件是否处理
2. **性能影响**: 是否引入性能问题（如 N+1 查询、大循环、不必要的重新渲染）
3. **安全性**: 输入验证、权限检查、注入风险、敏感数据泄露
4. **可维护性**: 代码是否清晰，命名是否合理，是否有适当注释
5. **向后兼容**: 是否破坏现有 API 接口或数据库迁移
6. **并发安全**: 是否有竞态条件、死锁风险（多线程/异步代码）
## 建议
    `;
  if (stats.additions > 500) {
    report += '- 变更较大（+' + stats.additions + ' 行），建议拆分 PR 以便审查\n';
  }
  if (!hasTestChanges && stats.additions > 50) {
    report += '- 建议添加单元测试覆盖新功能\n';
  }
  if (binaryFiles.length > 0) {
    report += '- 二进制文件不应出现在代码仓库中，考虑使用 Git LFS 或外部存储\n';
  }
  report += '\n## 变更文件列表\n\n';
  for (const f of changedFiles.slice(0, 30)) {
    report += '- `' + f + '`\n';
  }
  if (changedFiles.length > 30) {
    report += '- ... 及其他 ' + (changedFiles.length - 30) + ' 个文件\n';
  }
  report += `
## Diff 预览

\`\`\`diff
${diff.split('\n').slice(0, 100).join('\n')}
${diff.split('\n').length > 100 ? '\n... (diff 已截断，查看完整 diff 请运行: gh pr diff ' + prDetails.number + ')' : ''}
\`\`\`
`;
  return report;
}

// /review 命令的本地实现（基于 gh CLI）
const reviewCall: LocalCommandCall = async (args, context) => {
  const prNumber = parsePrNumber(args);
  // 如果没有提供 PR 编号，列出 PR
  if (!prNumber) {
    context.updateProgress?.('获取 PR 列表...');
    const prs = await listPrs();
    if (prs.length === 0) {
      return {
        type: 'text',
        value: '没有找到开放的 PR。\n\n使用 /review <编号> 审查特定 PR。',
      };
    }
    let listMessage = '找到以下开放 PR：\n\n';
    for (const pr of prs) {
      listMessage += `#${pr.number} - ${pr.title}\n   状态: ${pr.state} | 作者: ${pr.author}\n`;
    }
    listMessage += '\n使用 /review <编号> 审查特定 PR。';
    return {
      type: 'text',
      value: listMessage,
    };
  }
  try {
    context.updateProgress?.(`获取 PR #${prNumber} 详情...`);
    const prDetails = await getPrDetails(prNumber);
    if (!prDetails) {
      return {
        type: 'text',
        value: `无法获取 PR #${prNumber} 详情。\n\n请确认：\n- PR 编号正确\n- 已安装 gh CLI 并认证 (gh auth status)\n- 有权限访问该仓库`,
      };
    }
    context.updateProgress?.(`获取 PR #${prNumber} diff...`);
    const diff = await getPrDiff(prNumber);
    if (!diff) {
      return {
        type: 'text',
        value: `无法获取 PR #${prNumber} 的 diff。\n\nPR 可能为空或无变更。`,
      };
    }
    const report = generateReviewReport(prDetails, diff);
    return {
      type: 'text',
      value: report,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      type: 'text',
      value: `审查失败：${errorMsg}\n\n请确保已安装 gh CLI 并运行 gh auth login 认证。`,
    };
  }
};

// /review 命令导出（本地类型）
const review: Command = {
  type: 'local',
  name: 'review',
  description: '审查拉取请求',
  argumentHint: '[<PR编号>]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: reviewCall }),
};

// /ultrareview 命令导出（远程 bug 猎人路径，支持 Web 版 Claude Code 及许可控制）
const ultrareview: Command = {
  type: 'local-jsx',
  name: 'ultrareview',
  description: `约 10–20 分钟 · 查找并验证你分支中的 bug。在 Web 版 Claude Code 中运行。详见 ${CCR_TERMS_URL}`,
  isEnabled: () => isUltrareviewEnabled(),
  load: () => import('./review/ultrareviewCommand.js'),
};

export default review;
export { ultrareview };
