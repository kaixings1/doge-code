import { gitExe } from '../utils/git.js';
import { execFileNoThrow } from '../utils/execFileNoThrow.js';
import { getCwd } from '../utils/cwd.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getAttributionTexts, getEnhancedPRAttribution, } from '../utils/attribution.js';
import { executeShellCommandsInPrompt } from '../utils/promptShellExecution.js';
import { getUndercoverInstructions, isUndercover } from '../utils/undercover.js';
// ==================== 公共辅助函数 ====================
function getUsername() {
    // 优先使用 SAFEUSER 环境变量
    if (process.env.SAFEUSER) {
        return process.env.SAFEUSER.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }
    // 回退到 USER 环境变量
    if (process.env.USER) {
        return process.env.USER.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }
    return 'user';
}
/**
 * 生成分支名
 */
function generateBranchName(feature) {
    const username = getUsername();
    const safeFeature = feature
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
    if (!safeFeature) {
        return `${username}/update-${Date.now()}`;
    }
    // 限制总长度（git 分支名约 250 字节，此处粗略限制）
    const branch = `${username}/${safeFeature}`;
    return branch.substring(0, 250);
}
/**
 * 获取当前分支名
 */
async function getCurrentBranch() {
    const { stdout, code } = await execFileNoThrow(gitExe(), ['branch', '--show-current'], { preserveOutputOnError: false });
    return code === 0 ? stdout.trim() : null;
}
async function getDefaultBranch() {
    // 确保远程信息已获取
    await execFileNoThrow(gitExe(), ['fetch', 'origin', '--prune'], {
        preserveOutputOnError: false,
    });
    const { stdout, code } = await execFileNoThrow(gitExe(), ['remote', 'show', 'origin', '--', 'HEAD'], { preserveOutputOnError: false });
    if (code === 0) {
        const match = stdout.match(/HEAD branch: (\S+)/);
        if (match)
            return match[1];
    }
    const candidates = ['main', 'master', 'develop'];
    for (const candidate of candidates) {
        const { code: checkCode } = await execFileNoThrow(gitExe(), ['rev-parse', '--verify', candidate], { preserveOutputOnError: false });
        if (checkCode === 0)
            return candidate;
    }
    return 'main';
}
async function ensureGhCli() {
    const { code } = await execFileNoThrow('gh', ['--version'], {
        preserveOutputOnError: false,
    });
    if (code !== 0) {
        throw new Error('GitHub CLI (`gh`) 未安装或无法运行。请从 https://cli.github.com/ 安装并完成 gh auth login。');
    }
}
async function ensureGitOrigin() {
    const { stdout, code } = await execFileNoThrow(gitExe(), ['remote', 'get-url', 'origin'], { preserveOutputOnError: false });
    if (code !== 0 || !stdout.trim()) {
        throw new Error('未配置远程仓库 `origin`，请先运行 git remote add origin <url>');
    }
}
async function getExistingPr(branch) {
    const { stdout, code } = await execFileNoThrow('gh', ['pr', 'view', '--json', 'number', '--jq', '.number'], { preserveOutputOnError: false });
    if (code === 0 && stdout.trim()) {
        const number = parseInt(stdout.trim(), 10);
        return { exists: true, number };
    }
    return { exists: false };
}
async function getPrUrl(prNumber) {
    const { stdout, code } = await execFileNoThrow('gh', ['pr', 'view', prNumber.toString(), '--json', 'url', '--jq', '.url'], { preserveOutputOnError: false });
    return code === 0 && stdout.trim() ? stdout.trim() : `https://github.com/ PR #${prNumber}`;
}
async function getRecentCommits(branch, defaultBranch) {
    const { stdout, code } = await execFileNoThrow(gitExe(), ['log', '--oneline', '--format=%s', `${defaultBranch}..${branch}`], { preserveOutputOnError: false });
    if (code !== 0 || !stdout.trim())
        return ['更新代码'];
    return stdout.trim().split('\n');
}
/**
 * 统一的 PR 正文模板（本地与 AI 模式共用）
 * @param params.commits 提交列表
 * @param params.diffStats git diff --stat 输出
 * @param params.attribution 归属文本
 * @param params.includeChangelog 是否包含更新日志部分
 */
function buildPrBody({ commits, diffStats, attribution, includeChangelog = true, }) {
    const changelogSection = includeChangelog
        ? `

## 更新日志
<!-- CHANGELOG:START -->
[如果此 PR 包含面向用户的更改，请在此处添加更新日志条目。否则，删除此部分。]
<!-- CHANGELOG:END -->`
        : '';
    return `## 摘要
${commits.map((c) => `- ${c.split('\n')[0]}`).join('\n')}

## 测试计划
- [ ] 运行现有测试
- [ ] 手动验证更改

## 变更说明
${commits.join('\n\n')}

## 文件变更统计
\`\`\`
${diffStats || '无变更统计'}
\`\`\`
${changelogSection}
${attribution ? `\n${attribution}` : ''}`;
}
function parseArgs(args) {
    const result = {
        message: '',
        feature: '',
        title: null,
        baseBranch: null,
        noPush: false,
        noPr: false,
        force: false,
        draft: false,
        reviewer: null,
        labels: [],
        milestone: null,
    };
    // 简单标志
    if (args.includes('--no-push'))
        result.noPush = true;
    if (args.includes('--no-pr'))
        result.noPr = true;
    if (args.includes('--force'))
        result.force = true;
    if (args.includes('--draft'))
        result.draft = true;
    // 带值参数（支持双引号和单引号）
    const extractValue = (flag) => {
        const regex = new RegExp(`${flag}\\s+(["'])(.+?)\\1`);
        const match = args.match(regex);
        if (match)
            return match[2];
        // 尝试无引号
        const regexSimple = new RegExp(`${flag}\\s+(\\S+)`);
        const matchSimple = args.match(regexSimple);
        return matchSimple ? matchSimple[1] : null;
    };
    result.reviewer = extractValue('--reviewer');
    result.title = extractValue('--title');
    result.baseBranch = extractValue('--base');
    result.milestone = extractValue('--milestone');
    // --label 可以多次指定，用数组
    const labelRegex = /--label\s+(["'])(.+?)\1/gi;
    let labelMatch;
    while ((labelMatch = labelRegex.exec(args)) !== null) {
        result.labels.push(labelMatch[2]);
    }
    // 无引号的 --label
    const labelSimpleRegex = /--label\s+(\S+)/gi;
    while ((labelMatch = labelSimpleRegex.exec(args)) !== null) {
        // 避免重复添加已捕获的引号形式（简单处理：如果已存在则跳过）
        if (!result.labels.includes(labelMatch[1])) {
            result.labels.push(labelMatch[1]);
        }
    }
    // 提取 -m 消息
    const mFlagMatch = args.match(/-m\s+["']([^"']+)["']/);
    if (mFlagMatch) {
        result.message = mFlagMatch[1];
        // 移除消息部分，剩余作为 feature 描述
        const remaining = args.replace(/-m\s+["'][^"']+["']/, '').trim();
        result.feature = remaining
            .split(/\s+/)
            .filter((f) => f && !f.startsWith('-'))
            .join('-');
    }
    else {
        // 移除所有已知标志及值，剩余作为 feature
        const cleanArgs = args
            .replace(/--no-push|--no-pr|--force|--draft/g, '')
            .replace(/--reviewer\s+(["'])(.+?)\1/g, '')
            .replace(/--reviewer\s+\S+/g, '')
            .replace(/--title\s+(["'])(.+?)\1/g, '')
            .replace(/--title\s+\S+/g, '')
            .replace(/--base\s+(["'])(.+?)\1/g, '')
            .replace(/--base\s+\S+/g, '')
            .replace(/--milestone\s+(["'])(.+?)\1/g, '')
            .replace(/--milestone\s+\S+/g, '')
            .replace(/--label\s+(["'])(.+?)\1/g, '')
            .replace(/--label\s+\S+/g, '')
            .trim();
        result.feature = cleanArgs.replace(/\s+/g, '-');
    }
    return result;
}
const localCall = async (args, context) => {
    const cwd = getCwd();
    try {
        // 0. 环境前置检查
        await ensureGitOrigin();
        if (!args.includes('--no-pr')) {
            await ensureGhCli();
        }
        const defaultBranch = await getDefaultBranch();
        const currentBranch = await getCurrentBranch();
        const parsed = parseArgs(args);
        const baseBranch = parsed.baseBranch || defaultBranch;
        if (currentBranch === baseBranch && !parsed.force) {
            return {
                type: 'text',
                value: `当前在 ${baseBranch} 分支上。\n建议先创建功能分支。使用 --force 强制在当前分支操作。`,
            };
        }
        // 1. 分支管理
        let targetBranch = currentBranch;
        if (currentBranch === baseBranch) {
            targetBranch = generateBranchName(parsed.feature || 'feature');
            context.updateProgress?.(`创建分支: ${targetBranch}`);
            const { code: checkoutCode, stderr: checkoutStderr } = await execFileNoThrow(gitExe(), ['checkout', '-b', targetBranch], { preserveOutputOnError: false });
            if (checkoutCode !== 0) {
                return { type: 'text', value: `创建分支失败：\n${checkoutStderr || '未知错误'}` };
            }
        }
        // 2. 提交
        const { stdout: statusStdout } = await execFileNoThrow(gitExe(), ['status', '--porcelain'], { preserveOutputOnError: false });
        if (statusStdout.trim()) {
            context.updateProgress?.('暂存更改...');
            const { code: addCode, stderr: addStderr } = await execFileNoThrow(gitExe(), ['add', '-A'], { preserveOutputOnError: false });
            if (addCode !== 0) {
                return { type: 'text', value: `暂存更改失败：\n${addStderr || '未知错误'}` };
            }
            const commitMessage = parsed.message || `更新: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
            context.updateProgress?.('创建提交...');
            const { code: commitCode, stderr: commitStderr } = await execFileNoThrow(gitExe(), ['commit', '-m', commitMessage], { preserveOutputOnError: false });
            if (commitCode !== 0) {
                return { type: 'text', value: `提交失败：\n${commitStderr || '未知错误'}` };
            }
        }
        else {
            const { stdout: commitCount } = await execFileNoThrow(gitExe(), ['rev-list', '--count', `${baseBranch}..${targetBranch}`], { preserveOutputOnError: false });
            if (parseInt(commitCount.trim(), 10) === 0) {
                return { type: 'text', value: '没有要提交的更改。使用 /status 查看当前状态。' };
            }
        }
        // 3. 推送
        let pushOutput = '';
        if (!parsed.noPush) {
            context.updateProgress?.('推送到远程...');
            // 尝试普通推送
            let { code: pushCode, stdout: pushStdout, stderr: pushStderr } = await execFileNoThrow(gitExe(), ['push', '-u', 'origin', targetBranch], { preserveOutputOnError: false });
            if (pushCode !== 0) {
                // 推送冲突处理建议
                const conflictHint = pushStderr?.includes('non-fast-forward')
                    ? '\n\n远程分支有新的提交，请先运行 `git pull --rebase origin ' + targetBranch + '` 解决冲突后重新推送。'
                    : '';
                return {
                    type: 'text',
                    value: `推送失败：\n${pushStderr || pushStdout || '未知错误'}${conflictHint}\n\n手动推送：git push -u origin ${targetBranch}`,
                };
            }
            pushOutput = '✓ 已推送到远程\n';
        }
        // 4. PR 管理
        let prOutput = '';
        if (!parsed.noPr) {
            context.updateProgress?.('检查现有 PR...');
            const existingPr = await getExistingPr(targetBranch);
            const commits = await getRecentCommits(targetBranch, baseBranch);
            const { stdout: diffStats } = await execFileNoThrow(gitExe(), ['diff', '--stat', `${baseBranch}...${targetBranch}`], { preserveOutputOnError: false });
            const { commit: commitAttribution, pr: defaultPrAttribution } = getAttributionTexts();
            const effectivePrAttribution = await getEnhancedPRAttribution(context.getAppState);
            const includeChangelog = !(process.env.USER_TYPE === 'ant' && isUndercover());
            const prBody = buildPrBody({
                commits,
                diffStats: diffStats.trim(),
                attribution: effectivePrAttribution || defaultPrAttribution,
                includeChangelog,
            });
            const title = parsed.title || commits[0]?.split('\n')[0].substring(0, 70) || '更新代码';
            const ghArgsBase = ['pr', existingPr.exists ? 'edit' : 'create'];
            if (existingPr.exists && existingPr.number) {
                ghArgsBase.push(existingPr.number.toString());
            }
            if (!existingPr.exists) {
                ghArgsBase.push('--title', title, '--body', prBody, '--base', baseBranch);
                if (parsed.draft)
                    ghArgsBase.push('--draft');
                if (parsed.reviewer) {
                    ghArgsBase.push('--reviewer', parsed.reviewer);
                }
                else if (process.env.USER_TYPE !== 'ant' || !isUndercover()) {
                    ghArgsBase.push('--reviewer', 'anthropics/claude-code');
                }
            }
            else {
                ghArgsBase.push('--title', title, '--body', prBody);
                if (parsed.reviewer) {
                    ghArgsBase.push('--add-reviewer', parsed.reviewer);
                }
                else if (process.env.USER_TYPE !== 'ant' || !isUndercover()) {
                    ghArgsBase.push('--add-reviewer', 'anthropics/claude-code');
                }
            }
            // 标签（仅创建时支持，编辑时需单独处理，此处简化）
            if (!existingPr.exists && parsed.labels.length > 0) {
                parsed.labels.forEach((label) => ghArgsBase.push('--label', label));
            }
            if (!existingPr.exists && parsed.milestone) {
                ghArgsBase.push('--milestone', parsed.milestone);
            }
            const { code: ghCode, stdout: ghStdout, stderr: ghStderr } = await execFileNoThrow('gh', ghArgsBase, { preserveOutputOnError: false });
            if (ghCode === 0) {
                if (existingPr.exists) {
                    prOutput = `✓ 已更新 PR #${existingPr.number}\n  ${await getPrUrl(existingPr.number)}`;
                }
                else {
                    const prUrl = ghStdout.trim();
                    prOutput = `✓ 已创建 PR\n  ${prUrl}`;
                    if ((process.env.USER_TYPE !== 'ant' || !isUndercover()) &&
                        existsSync(join(cwd, 'CLAUDE.md'))) {
                        const claudeMd = readFileSync(join(cwd, 'CLAUDE.md'), 'utf-8');
                        if (/slack|发布.*channel|send.*slack/i.test(claudeMd)) {
                            prOutput += `\n\n💡 检测到 CLAUDE.md 中可能要求发布到 Slack。可使用 \`/mcp__slack__send_message\` 工具将 PR 链接发送到相关频道。`;
                        }
                    }
                }
            }
            else {
                // 增强错误信息
                let errorHint = '';
                if (ghStderr?.includes('401')) {
                    errorHint = '\n认证失败，请运行 `gh auth login` 重新登录。';
                }
                else if (ghStderr?.includes('base branch')) {
                    errorHint = '\n目标分支不存在或权限不足，请确认 --base 参数。';
                }
                prOutput = `⚠ ${existingPr.exists ? '更新' : '创建'} PR 失败：${ghStderr || ghStdout || '未知错误'}${errorHint}\n`;
            }
        }
        const { stdout: hashStdout } = await execFileNoThrow(gitExe(), ['rev-parse', 'HEAD'], { preserveOutputOnError: false });
        const commitHash = hashStdout.trim().substring(0, 7);
        let resultMessage = `✓ 完成\n\n分支: ${targetBranch}\n提交: ${commitHash}\n`;
        if (pushOutput)
            resultMessage += `\n${pushOutput}`;
        if (prOutput)
            resultMessage += `\n${prOutput}`;
        resultMessage += `\n\n下一步:\n- 查看 PR: gh pr view${prOutput ? '' : ' --web'}\n- 合并 PR: gh pr merge`;
        return { type: 'text', value: resultMessage };
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return { type: 'text', value: `执行失败：${errorMsg}` };
    }
};
const localCommand = {
    type: 'local',
    name: 'commit-push-pr',
    description: '提交、推送并创建拉取请求（直接执行）',
    argumentHint: '[-m <消息>] [功能描述] [--no-push] [--no-pr] [--force] [--draft] [--reviewer <用户名>] [--title <标题>] [--base <分支>] [--label <标签>] [--milestone <里程碑>]',
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call: localCall }),
};
// ==================== AI Prompt 命令（AI 模式） ====================
const ALLOWED_TOOLS = [
    'Bash(git checkout --branch:*)',
    'Bash(git checkout -b:*)',
    'Bash(git add:*)',
    'Bash(git status:*)',
    'Bash(git push:*)',
    'Bash(git commit:*)',
    'Bash(gh pr create:*)',
    'Bash(gh pr edit:*)',
    'Bash(gh pr view:*)',
    'Bash(gh pr merge:*)',
    'ToolSearch',
    'mcp__slack__send_message',
    'mcp__claude_ai_Slack__slack_send_message',
];
/**
 * 获取 AI 模式的 PR 正文模板（用于嵌入 prompt）
 * 与本地模板保持一致，但以 heredoc 形式指导 AI
 */
function getAIPrBodyTemplate(effectivePrAttribution, includeChangelog) {
    // 使用与 buildPrBody 相同的结构，但用占位符填充
    const changelogSection = includeChangelog
        ? `

## 更新日志
<!-- CHANGELOG:START -->
[如果此 PR 包含面向用户的更改，请在此处添加更新日志条目。否则，删除此部分。]
<!-- CHANGELOG:END -->`
        : '';
    // 返回模板文本，指示 AI 填充内容
    return `## 摘要
<1-3 个要点>

## 测试计划
[用于测试拉取请求的待办事项要点列表...]${changelogSection}${effectivePrAttribution ? `\n\n${effectivePrAttribution}` : ''}`;
}
function getPromptContent(defaultBranch, prAttribution) {
    const { commit: commitAttribution, pr: defaultPrAttribution } = getAttributionTexts();
    const effectivePrAttribution = prAttribution ?? defaultPrAttribution;
    const safeUser = process.env.SAFEUSER || '';
    const username = process.env.USER || '';
    // 根据 undercover 调整
    let prefix = '';
    let reviewerArg = ' 和 `--reviewer anthropics/claude-code`';
    let addReviewerArg = '（并添加 `--add-reviewer anthropics/claude-code`）';
    let slackStep = `

5. 创建/更新 PR 后，检查用户的 CLAUDE.md 是否提及发布到 Slack 频道。如果是，使用 ToolSearch 搜索 "slack send message" 工具。如果 ToolSearch 找到 Slack 工具，询问用户是否希望你将 PR 链接发布到相关 Slack 频道。仅在用户确认后后才发布。如果 ToolSearch 返回无结果或错误，请静默跳过此步骤——不要提及失败，不要尝试解决方法，也不要尝试其他方法。`;
    let changelogIncluded = true;
    if (process.env.USER_TYPE === 'ant' && isUndercover()) {
        prefix = getUndercoverInstructions() + '\n';
        reviewerArg = '';
        addReviewerArg = '';
        slackStep = '';
        changelogIncluded = false;
    }
    const prBodyTemplate = getAIPrBodyTemplate(effectivePrAttribution, changelogIncluded);
    return `${prefix}## Context

- \`SAFEUSER\`: ${safeUser}
- \`whoami\`: ${username}
- \`git status\`: !\`git status\`
- \`git diff HEAD\`: !\`git diff HEAD\`
- \`git branch --show-current\`: !\`git branch --show-current\`
- \`git diff ${defaultBranch}...HEAD\`: !\`git diff ${defaultBranch}...HEAD\`
- \`gh pr view --json number 2>/dev/null || true\`: !\`gh pr view --json number 2>/dev/null || true\`

## Git 安全协议

- 绝不更新 git 配置
- 绝不执行破坏性/不可逆的 git 命令（如 push --force、hard reset 等），除非用户明确要求
- 绝不跳过钩子（--no-verify、--no-gpg-sign 等），除非用户明确要求
- 绝不向 main/master 执行强制推送，如果用户要求则警告
- 不要提交可能包含秘密的文件（.env、credentials.json 等）
- 绝不使用带 -i 标志的 git 命令（如 git rebase -i 或 git add -i），因为它们需要交互式输入，而这是不支持的

## 你的任务

分析将包含在拉取请求中的所有更改，确保查看所有相关提交（不仅是最新提交，而是所有将包含在拉取请求中的提交，来自上面的 git diff ${defaultBranch}...HEAD 输出）。

基于上述更改：
1. 如果在 ${defaultBranch} 上，创建新分支（使用上面上下文中的 SAFEUSER 作为分支名前缀，如果 SAFEUSER 为空则回退到 whoami，例如：\`username/feature-name\`）
2. 使用 heredoc 语法创建单个提交，并带有适当的提交消息${commitAttribution ? `，以下面示例中显示的归属文本结尾` : ''}：
\`\`\`
git commit -m "$(cat <<'EOF'
提交消息在这里。${commitAttribution ? `\n\n${commitAttribution}` : ''}
EOF
)"
\`\`\`
3. 将分支推送到 origin
4. 如果此分支已存在 PR（检查上面的 gh pr view 输出），使用 \`gh pr edit\` 更新 PR 标题和正文以反映当前的 diff${addReviewerArg}。否则，使用 \`gh pr create\` 创建拉取请求，正文使用 heredoc 语法${reviewerArg}。
   - 重要提示：PR 标题要简短（不超过 70 个字符）。使用正文添加详细信息。
\`\`\`
gh pr create --title "简短且具有描述性的标题" --body "$(cat <<'EOF'
${prBodyTemplate}
EOF
)"
\`\`\`

你具有在单个响应中调用多个工具的能力。你必须在一条消息中完成上述所有操作。${slackStep}

完成后返回 PR URL，以便用户可以查看。`;
}
const promptCommand = {
    type: 'prompt',
    name: 'commit-push-pr-prompt',
    description: '提交、推送并创建拉取请求（AI 生成内容）',
    allowedTools: ALLOWED_TOOLS,
    get contentLength() {
        // 使用一个代表性的默认分支估算长度，实际 prompt 会运行时生成
        return getPromptContent('main').length;
    },
    progressMessage: '正在创建提交和 PR（AI 模式）',
    source: 'builtin',
    async getPromptForCommand(args, context) {
        const [defaultBranch, prAttribution] = await Promise.all([
            getDefaultBranch(),
            getEnhancedPRAttribution(context.getAppState),
        ]);
        let promptContent = getPromptContent(defaultBranch, prAttribution);
        const trimmedArgs = args?.trim();
        if (trimmedArgs) {
            promptContent += `\n\n## Additional instructions from user\n\n${trimmedArgs}`;
        }
        const finalContent = await executeShellCommandsInPrompt(promptContent, {
            ...context,
            getAppState() {
                const appState = context.getAppState();
                return {
                    ...appState,
                    toolPermissionContext: {
                        ...appState.toolPermissionContext,
                        alwaysAllowRules: {
                            ...appState.toolPermissionContext.alwaysAllowRules,
                            command: ALLOWED_TOOLS,
                        },
                    },
                };
            },
        }, '/commit-push-pr-prompt');
        return [{ type: 'text', text: finalContent }];
    },
};
// ==================== 导出 ====================
export default localCommand;
export { promptCommand as commitPushPrPrompt };
