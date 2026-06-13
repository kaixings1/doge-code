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
function generateReviewReport(
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
  // 解析 diff 统计
  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      stats.filesChanged++;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      stats.additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      stats.deletions++;
    }
  }
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
## PR 描述
${prDetails.body || '*无描述*'}
## 代码审查

`;
  // 基本检查
  const checks = [];
  // 检查是否有测试文件变更
  const hasTestChanges = diff.includes('test') || diff.includes('spec') || diff.includes('__tests__');
  checks.push({
    name: '测试覆盖',
    passed: hasTestChanges,
    message: hasTestChanges ? '✓ 包含测试变更' : '⚠ 未检测到测试文件变更，建议添加测试',
  });
  // 检查是否有文档变更
  const hasDocChanges = diff.includes('.md') || diff.includes('docs/');
  checks.push({
    name: '文档更新',
    passed: hasDocChanges,
    message: hasDocChanges ? '✓ 包含文档更新' : 'ℹ 未检测到文档变更',
  });
  // 检查是否有 TODO/FIXME
  const hasTodos = diff.match(/\/\/\s*TODO|#\s*TODO|\/\*\s*TODO/i);
  if (hasTodos) {
    checks.push({
      name: '待办事项',
      passed: false,
      message: '⚠ 代码中包含 TODO/FIXME 注释，请在合并前处理',
    });
  }
  // 检查是否有 console.log/debugger
  const hasDebug = diff.match(/console\.(log|debug|info|warn|error)|debugger|print\(/i);
  if (hasDebug) {
    checks.push({
      name: '调试代码',
      passed: false,
      message: '⚠ 包含调试语句 (console.log/debugger)，请在生产代码中移除',
    });
  }
  // 检查是否有敏感信息
  const hasSecrets = diff.match(/password|secret|key|token|api[_-]key/i);
  if (hasSecrets) {
    checks.push({
      name: '敏感信息',
      passed: false,
      message: '⚠ 检测到可能的敏感信息（密码/密钥/令牌），请确认不应硬编码',
    });
  }
  report += '### 自动检查\n\n';
  for (const check of checks) {
    report += `- ${check.message}\n`;
  }
  report += `
## 审查要点

请人工审查以下方面：
1. **代码正确性**: 逻辑是否正确，边界条件是否处理
2. **性能影响**: 是否引入性能问题（如 N+1 查询、大循环）
3. **安全性**: 输入验证、权限检查、注入风险
4. **可维护性**: 代码是否清晰，是否有适当注释
5. **向后兼容**: 是否破坏现有 API 或接口
## 建议
    `;
  if (stats.additions > 500) {
    report += '- 变更较大，建议拆分 PR 以便审查\n';
  }
  if (!hasTestChanges && stats.additions > 50) {
    report += '- 建议添加单元测试覆盖新功能\n';
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