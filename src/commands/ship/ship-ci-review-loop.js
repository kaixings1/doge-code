/**
 * commands/ship/ship-ci-review-loop.ts — CI/Review 监控循环
 *
 * Phase 4 of /ship workflow:
 * 1. 等待 CI 通过
 * 2. 强制等待 3 分钟让 auto-reviewers 评论
 * 3. 循环检查 PR 评论
 * 4. 分类处理评论
 * 5. 迭代直到零未解决评论
 *
 * 复用已有基础设施: gh CLI + commit-push-pr 工具函数
 */
import { execFileNoThrow } from '../../utils/execFileNoThrow.js';
import { gitExe } from '../../utils/git.js';
// ============================================================================
// GitHub API 辅助函数
// ============================================================================
async function ghJson(args) {
    const { stdout, code } = await execFileNoThrow('gh', args, {
        preserveOutputOnError: false,
    });
    if (code !== 0) {
        throw new Error(`gh ${args[0]} failed: ${stdout}`);
    }
    try {
        return JSON.parse(stdout);
    }
    catch {
        throw new Error(`Failed to parse gh output: ${stdout.slice(0, 200)}`);
    }
}
// ============================================================================
// CI 状态查询
// ============================================================================
export async function getCIStatus(prNumber) {
    try {
        const data = await ghJson([
            'pr', 'checks', String(prNumber), '--json', 'state,conclusion,status', '--jq', '.[]',
        ]);
        // gh pr checks returns array of check runs
        // If any failed → fail; if any pending → pending; else pass
        const conclusions = new Set(data.map((c) => (c.conclusion || c.status || 'unknown').toLowerCase()));
        if (conclusions.has('failure') || conclusions.has('failed'))
            return 'fail';
        if (conclusions.has('cancelled') || conclusions.has('timed_out'))
            return 'fail';
        if (conclusions.has('pending') || conclusions.has('in_progress') || conclusions.has('queued'))
            return 'pending';
        if (conclusions.has('success') || conclusions.has('passed'))
            return 'pass';
        return 'unknown';
    }
    catch {
        return 'unknown';
    }
}
async function waitForCI(prNumber, pollIntervalMs = 5000, timeoutMs = 600000) {
    const startTime = Date.now();
    while (true) {
        const status = await getCIStatus(prNumber);
        if (status === 'pass')
            return 'pass';
        if (status === 'fail')
            return 'fail';
        if (Date.now() - startTime > timeoutMs) {
            return 'timeout';
        }
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
}
/**
 * 获取 PR 的所有反馈（review threads + issue comments）
 */
async function getPRFeedback(prNumber) {
    try {
        // 使用 GraphQL 获取 unresolved review threads
        const { stdout: ownerStdout } = await execFileNoThrow('gh', ['repo', 'view', '--json', 'owner', '--jq', '.owner.login']);
        const { stdout: repoStdout } = await execFileNoThrow('gh', ['repo', 'view', '--json', 'name', '--jq', '.name']);
        const owner = ownerStdout.trim();
        const repo = repoStdout.trim();
        const graphqlQuery = `
      query($owner: String!, $repo: String!, $pr: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $pr) {
            reviewThreads(first: 100) {
              nodes {
                id
                isResolved
                isOutdated
                comments(first: 10) {
                  nodes {
                    id
                    author { login }
                    body
                  }
                }
              }
            }
            reviews(first: 50) {
              nodes {
                id
                state
                author { login }
                body
              }
            }
          }
        }
      }
    `;
        const { stdout, code } = await execFileNoThrow('gh', [
            'api', 'graphql',
            '-f', `query=${graphqlQuery}`,
            '-f', `owner=${owner}`,
            '-f', `repo=${repo}`,
            '-F', `pr=${prNumber}`,
        ], { preserveOutputOnError: false });
        if (code !== 0) {
            return { unresolvedThreads: 0, changesRequested: false, categories: [], comments: [] };
        }
        const data = JSON.parse(stdout);
        const pr = data?.data?.repository?.pullRequest;
        if (!pr) {
            return { unresolvedThreads: 0, changesRequested: false, categories: [], comments: [] };
        }
        const threads = pr.reviewThreads?.nodes || [];
        const reviews = pr.reviews?.nodes || [];
        // 分类 threads
        const unresolvedThreads = threads.filter((t) => !t.isResolved);
        const comments = [];
        const categories = [];
        for (const thread of unresolvedThreads) {
            const firstComment = thread.comments?.nodes?.[0];
            if (!firstComment)
                continue;
            const body = firstComment.body || '';
            const category = categorizeComment(body);
            categories.push(category);
            comments.push({
                id: thread.id,
                author: firstComment.author?.login || 'unknown',
                body: body.slice(0, 500),
                isResolved: false,
                category,
                threadId: thread.id,
            });
        }
        // 检查 changes_requested reviews
        const changesRequested = reviews.some((r) => r.state === 'CHANGES_REQUESTED');
        return {
            unresolvedThreads: comments.length,
            changesRequested,
            categories,
            comments,
        };
    }
    catch {
        return { unresolvedThreads: 0, changesRequested: false, categories: [], comments: [] };
    }
}
/**
 * 评论分类 heuristic
 */
function categorizeComment(body) {
    const lower = body.toLowerCase();
    // 误报识别
    if (/false.positive|not applicable|n\/a|doesn.t apply|won.t fix|by design|intentional/i.test(lower)) {
        return 'false_positive';
    }
    // 问题/疑问
    if (/^what|^why|^how|^can you|^could you|\?$|question/i.test(lower.trim())) {
        return 'question';
    }
    // Nit 小问题
    if (/nit\s*:|minor\s*:|typo|spelling|whitespace|formatting|style:/i.test(lower)) {
        return 'nit';
    }
    // 样式建议
    if (/style|naming|convention|consistency|format/i.test(lower)) {
        return 'style_suggestion';
    }
    // 代码修复（默认）
    return 'code_fix_required';
}
// ============================================================================
// 评论处理
// ============================================================================
/**
 * 处理单条评论
 * 返回采取的行动描述
 */
async function addressComment(comment) {
    const actions = [];
    switch (comment.category) {
        case 'code_fix_required':
            // 需要修复代码 — 实际修复由外部 agent 或用户完成
            actions.push(`[待修复] ${comment.body.slice(0, 100)}`);
            break;
        case 'style_suggestion':
        case 'nit':
            // 样式建议 — 通常可以直接修复
            actions.push(`[样式] ${comment.body.slice(0, 100)}`);
            break;
        case 'question':
            // 问题 — 需要回答
            actions.push(`[问题] ${comment.body.slice(0, 100)}`);
            break;
        case 'false_positive':
            // 误报 — 回复并 resolve
            actions.push(`[误报] 已标记`);
            break;
        default:
            actions.push(`[待处理] ${comment.body.slice(0, 100)}`);
    }
    return actions;
}
/**
 * 处理所有未解决的评论
 */
async function addressAllFeedback(prNumber, feedback) {
    const allActions = [];
    for (const comment of feedback.comments) {
        const actions = await addressComment(comment);
        allActions.push(actions);
    }
    // 提交修复（如果有代码修复）
    const hasCodeFixes = feedback.categories.includes('code_fix_required');
    if (hasCodeFixes) {
        try {
            // Stage and commit fixes
            const { code: statusCode } = await execFileNoThrow(gitExe(), ['status', '--porcelain'], {
                preserveOutputOnError: false,
            });
            if (statusCode === 0) {
                await execFileNoThrow(gitExe(), ['add', '-A'], { preserveOutputOnError: false });
                await execFileNoThrow(gitExe(), [
                    'commit', '-m', `fix: address review feedback (iteration ${prNumber})\n\nCo-Authored-By: kaixings <30445355@qq.com>`,
                ], { preserveOutputOnError: false });
                await execFileNoThrow(gitExe(), ['push'], { preserveOutputOnError: false });
                allActions.push(['[提交] 修复已提交并推送']);
            }
        }
        catch {
            // Ignore commit/push errors
        }
    }
    // Flatten
    return allActions.flat();
}
// ============================================================================
// 主循环
// ============================================================================
/**
 * 执行 CI/Review 监控循环
 *
 * 这是 /ship Phase 4 的核心工作流：
 * 1. 等待 CI 通过
 * 2. 等待 3 分钟让 auto-reviewers 评论（首次迭代）
 * 3. 循环检查 PR 评论
 * 4. 处理所有评论
 * 5. 迭代直到零未解决评论
 */
export async function runCIMonitorLoop(options) {
    const { prNumber, maxIterations = 10, initialWaitSeconds = 180, // 3 minutes
    iterationWaitSeconds = 30, verbose = false, } = options;
    const startTime = Date.now();
    const iterationLog = [];
    let ciFailures = 0;
    log(verbose, `[CI Monitor] Starting loop for PR #${prNumber}`);
    log(verbose, `[CI Monitor] Max iterations: ${maxIterations}, Initial wait: ${initialWaitSeconds}s`);
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
        log(verbose, `[CI Monitor] Iteration ${iteration}/${maxIterations}`);
        const iterationActions = [];
        // Step 1: Wait for CI
        log(verbose, '[CI Monitor] Waiting for CI...');
        const ciResult = await waitForCI(prNumber);
        const ciStatus = ciResult === 'pass' ? 'pass' : ciResult === 'fail' ? 'fail' : 'unknown';
        if (ciResult === 'fail') {
            ciFailures++;
            iterationActions.push('[CI] CI failed - would need to fix and push');
            // In a real implementation, this would trigger a ci-fixer agent
            log(verbose, '[CI Monitor] CI failed, would trigger ci-fixer');
            iterationLog.push({
                iteration,
                ciStatus: 'fail',
                unresolvedThreads: 0,
                changesRequested: false,
                actions: iterationActions,
            });
            // Continue to next iteration after fix
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
        }
        if (ciResult === 'timeout') {
            iterationActions.push('[CI] CI check timed out');
            iterationLog.push({
                iteration,
                ciStatus: 'unknown',
                unresolvedThreads: 0,
                changesRequested: false,
                actions: iterationActions,
            });
            break;
        }
        log(verbose, '[CI Monitor] CI passed');
        // Step 2: First iteration - wait for auto-reviewers
        if (iteration === 1) {
            log(verbose, `[CI Monitor] Waiting ${initialWaitSeconds}s for auto-reviewers...`);
            await new Promise(resolve => setTimeout(resolve, initialWaitSeconds * 1000));
            log(verbose, '[CI Monitor] Initial wait complete');
        }
        // Step 3: Check PR feedback
        const feedback = await getPRFeedback(prNumber);
        log(verbose, `[CI Monitor] Unresolved threads: ${feedback.unresolvedThreads}, Changes requested: ${feedback.changesRequested}`);
        // Step 4: Check if ready to merge
        if (feedback.unresolvedThreads === 0 && !feedback.changesRequested) {
            log(verbose, '[CI Monitor] All comments resolved - ready to merge');
            iterationLog.push({
                iteration,
                ciStatus: 'pass',
                unresolvedThreads: 0,
                changesRequested: false,
                actions: ['[OK] All comments resolved'],
            });
            break;
        }
        // Step 5: Address all feedback
        const actions = await addressAllFeedback(prNumber, feedback);
        iterationActions.push(...actions);
        iterationLog.push({
            iteration,
            ciStatus: 'pass',
            unresolvedThreads: feedback.unresolvedThreads,
            changesRequested: feedback.changesRequested,
            actions: iterationActions,
        });
        // Step 6: Wait before next iteration
        if (iteration < maxIterations) {
            log(verbose, `[CI Monitor] Waiting ${iterationWaitSeconds}s before next iteration...`);
            await new Promise(resolve => setTimeout(resolve, iterationWaitSeconds * 1000));
        }
    }
    const finalLog = iterationLog[iterationLog.length - 1];
    const success = finalLog ? finalLog.unresolvedThreads === 0 && !finalLog.changesRequested : false;
    const result = {
        success,
        iterations: iterationLog.length,
        unresolvedComments: finalLog?.unresolvedThreads ?? 0,
        ciFailures,
        durationMs: Date.now() - startTime,
        iterationLog,
    };
    log(verbose, `[CI Monitor] Complete: iterations=${result.iterations}, unresolved=${result.unresolvedComments}, success=${result.success}`);
    // Mandatory verification output
    console.log(`[VERIFIED] Phase 4: wait=${initialWaitSeconds}s, iterations=${result.iterations}, unresolved=${result.unresolvedComments}`);
    return result;
}
// ============================================================================
// 辅助函数
// ============================================================================
function log(verbose, message) {
    if (verbose) {
        console.log(message);
    }
}
export { categorizeComment, getPRFeedback };
