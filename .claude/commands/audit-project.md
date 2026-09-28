---
description: 多代理代码审查与迭代改进
argument-hint: "[scope] [--recent] [--domain AGENT] [--quick] [--create-tech-debt] [--resume]"
allowed-tools: Bash(git:*), Bash(node:*), Read, Write, Edit, Glob, Grep, Task, AskUserQuestion
---

# /audit-project - 多代理代码审查

使用专门化 AI 代理进行全面代码审查，并迭代改进。

## 快速参考

| 阶段 | 描述 | 详情 |
|-------|-------------|---------|
| 1 | 上下文与代理选择 | 本文件 |
| 2 | 多代理审查 | 见 `audit-project-agents.md` |
| 3-4 | 技术债与修复 | 本文件 |
| 5-6 | 验证与迭代 | 本文件 |
| 7 | 完成报告 | 本文件 |
| 8 | GitHub Issues | 见 `audit-project-github.md` |

## 参数

从 $ARGUMENTS 解析：
- **Scope**：要审查的路径（默认 `.`）或 `--recent`（仅最近 5 个提交）
- **--domain AGENT**：只用特定代理审查（例如 `--domain security`）
- **--quick**：单遍，不迭代（快速反馈）
- **--create-tech-debt**：强制创建/更新 TECHNICAL_DEBT.md
- **--resume**：从既有审查队列文件恢复

### 恢复模式

如果提供了 `--resume`，复用平台状态目录中最近的审查队列。
否则创建新的队列文件。队列处理见 `audit-project-agents.md`。

## 阶段 1：上下文收集

### 平台检测

```bash
# Get plugin root using Node.js helper
PLUGIN_ROOT=$(node -e "const { getPluginRoot } = require('@awesome-slash/lib/cross-platform'); const root = getPluginRoot('audit-project'); if (!root) { console.error('Error: Could not locate audit-project plugin root'); process.exit(1); } console.log(root);")
PLATFORM=$(node "$PLUGIN_ROOT/lib/platform/detect-platform.js")
TOOLS=$(node "$PLUGIN_ROOT/lib/platform/verify-tools.js")

PROJECT_TYPE=$(echo $PLATFORM | jq -r '.projectType')
PACKAGE_MGR=$(echo $PLATFORM | jq -r '.packageManager')

# Detect framework
FRAMEWORK="unknown"
if [ "$PROJECT_TYPE" = "nodejs" ]; then
  [ -n "$(jq -e '.dependencies.react' package.json 2>/dev/null)" ] && FRAMEWORK="react"
  [ -n "$(jq -e '.dependencies.express' package.json 2>/dev/null)" ] && FRAMEWORK="express"
elif [ "$PROJECT_TYPE" = "python" ]; then
  grep -q "django" requirements.txt 2>/dev/null && FRAMEWORK="django"
  grep -q "fastapi" requirements.txt 2>/dev/null && FRAMEWORK="fastapi"
fi

RESUME_MODE=$([ "${ARGUMENTS}" != "${ARGUMENTS%--resume*}" ] && echo "true" || echo "false")
```

### 项目分析

```bash
FILE_COUNT=$(git ls-files | wc -l)
TEST_FILES=$(git ls-files | grep -E '(test|spec)\.' | wc -l)
HAS_TESTS=$( [ "$TEST_FILES" -gt 0 ] && echo "true" || echo "false" )
HAS_DB=$(grep -rq -E "(Sequelize|Prisma|TypeORM)" . 2>/dev/null && echo "true" || echo "false")
HAS_API=$(grep -rq -E "(express|fastify|@nestjs)" . 2>/dev/null && echo "true" || echo "false")
HAS_FRONTEND=$( [ "$(git ls-files | grep -E '\.(tsx|jsx|vue|svelte)$' | wc -l)" -gt 0 ] && echo "true" || echo "false" )
HAS_BACKEND=$(grep -rq -E "(express|fastify|@nestjs|koa|hapi)" . 2>/dev/null && echo "true" || echo "false")
if [ -d ".github/workflows" ] || [ -f ".gitlab-ci.yml" ] || [ -f ".circleci/config.yml" ] || \
  [ -f "Jenkinsfile" ] || [ -f ".travis.yml" ] || [ -f "azure-pipelines.yml" ] || \
  [ -f "bitbucket-pipelines.yml" ]; then
  HAS_CICD="true"
else
  HAS_CICD="false"
fi
```

### 代理选择

**始终启用：**
- `code-quality-reviewer`：代码质量、错误处理、可维护性
- `security-expert`：安全漏洞、认证、输入校验
- `performance-engineer`：性能瓶颈、算法、内存
- `test-quality-guardian`：测试覆盖与质量（报告缺失的测试）

**条件启用：**
- `architecture-reviewer`：设计模式（如果 `FILE_COUNT > 50`）
- `database-specialist`：查询优化（如果 `HAS_DB=true`）
- `api-designer`：REST 最佳实践（如果 `HAS_API=true`）
- `frontend-specialist`：组件设计（如果 `HAS_FRONTEND=true`）
- `backend-specialist`：服务与领域逻辑（如果 `HAS_BACKEND=true`）
- `devops-reviewer`：CI/CD 配置（如果 `HAS_CICD=true`）

## 阶段 2：多代理审查

详细的代理协调见 `audit-project-agents.md`。

**审查队列：** 把发现写入平台状态目录中的临时队列文件，并持续更新直到所有问题解决。队列为空时删除该文件。

### 发现格式（必需）

每条发现**必须**包含：
- **File:Line**：精确位置（例如 `src/auth/session.ts:42`）
- **Severity**：critical | high | medium | low
- **Category**：来自代理领域
- **Description**：哪里错了以及为什么
- **Code Quote**：展示问题的 1-3 行代码
- **Suggested Fix**：具体的修复方案
- **Effort**：small | medium | large

### 发现示例

```markdown
### Finding: Unsafe SQL Query
**Agent**: security-expert
**File**: src/api/users.ts:87
**Severity**: critical
**Code**:
```typescript
const query = `SELECT * FROM users WHERE id = ${userId}`;
```
**Fix**: Use parameterized queries.
**Effort**: small
```

## 阶段 3：技术债记录

如果 TECHNICAL_DEBT.md 存在或指定了 `--create-tech-debt`：

```markdown
# Technical Debt

Last updated: $(date -I)

## Summary
**Total Issues**: X | Critical: Y | High: Z | Medium: A | Low: B

## Critical Issues
[Grouped by severity with file:line, description, fix, effort]

## Progress Tracking
- [ ] Issue 1
- [ ] Issue 2
```

## 阶段 4：自动修复

### 修复策略

1. **可自动修复**（lint、格式）：直接应用
2. **手动修复**（代码逻辑）：实现建议的修复
3. **需要设计决策**：标记为阻塞并报告给用户
4. **误报**：标记并从审查队列中移除

### 修复顺序

1. 先 critical 严重程度
2. 然后 high → medium → low
3. 然后按工作量（small → large）
4. 然后按文件批量处理

## 阶段 5：验证

```bash
# Run tests
[ -n "$TEST_CMD" ] && $TEST_CMD
TEST_STATUS=$?

# Run linter
[ -n "$LINT_CMD" ] && $LINT_CMD
LINT_STATUS=$?

# Run build
[ -n "$BUILD_CMD" ] && $BUILD_CMD
BUILD_STATUS=$?

# Overall status
VERIFICATION_PASSED=$([ $TEST_STATUS -eq 0 ] && [ $LINT_STATUS -eq 0 ] && [ $BUILD_STATUS -eq 0 ] && echo "true" || echo "false")
```

### 处理失败

如果验证失败：
1. 审查最近的变更（`git diff`）
2. 定位导致破坏的修复
3. 回滚：`git restore <file>`
4. 记录为 "fix caused regression"

## 阶段 6：迭代

```javascript
const initialReview = /* results from Phase 2 review */;
const initialIssues = Array.isArray(initialReview?.issues) ? initialReview.issues : [];
let iteration = 1;
let remainingIssues = initialIssues;

while (remainingIssues.length > 0) {
  const fixResult = applyFixes(remainingIssues);

  const verifyResult = runVerification();
  if (!verifyResult.passed) {
    rollbackFailed(fixResult);
  }

  const reReviewResult = reReview(fixResult.changedFiles);
  remainingIssues = reReviewResult.issues;

  if (remainingIssues.length === 0) {
    console.log("[OK] Zero issues remaining!");
    break;
  }

  iteration++;
}
```

### 快速模式

如果指定了 `--quick` 标志：单遍扫描，只给发现，不做修复。

## 阶段 6.5：决策关卡（用户）

每次迭代后（或问题仍存在时的重审后），报告队列状态并询问用户下一步做什么。

```javascript
const openCount = remainingIssues.length;
console.log(`Open issues: ${openCount}`);
console.log(`Queue file: ${reviewQueuePath}`); // set in Phase 2 (audit-project-agents)

const decision = await AskUserQuestion({
  questions: [{
    header: "Audit Decision",
    question: "Review queue still open. What next?",
    options: [
      { label: "Continue review", description: "Run another iteration" },
      { label: "Create issues", description: "Stop and create issues" },
      { label: "Update tech debt", description: "Stop and update TECHNICAL_DEBT.md" },
      { label: "Leave queue", description: "Stop and keep queue for resume" }
    ],
    multiSelect: false
  }]
});

const choice = decision[0];
if (choice === 'Continue review') {
  // continue loop
} else if (choice === 'Create issues') {
  // Create issues and remove queue file
} else if (choice === 'Update tech debt') {
  // Update TECHNICAL_DEBT.md and remove queue file
} else if (choice === 'Leave queue') {
  // Leave queue file for --resume
  break;
}
```

## 阶段 7：完成报告

```markdown
# Project Review Complete

**Scope**: ${SCOPE} | **Framework**: ${FRAMEWORK}
**Iterations**: ${iteration} | **Duration**: ${duration}

## Summary
**Issues Found**: ${initialCount}
**Issues Fixed**: ${fixedCount}
**Remaining**: ${remainingCount}

## By Severity
- Critical: ${criticalFound} → ${criticalRemaining}
- High: ${highFound} → ${highRemaining}
- Medium: ${mediumFound} → ${mediumRemaining}
- Low: ${lowFound} → ${lowRemaining}

## Verification
- Tests: [OK]/[FAIL]
- Linter: [OK]/[FAIL]
- Build: [OK]/[FAIL]

## Files Changed
${FILE_COUNT} files modified

## Remaining Issues
[List of issues needing attention]
```

## 阶段 8：创建 GitHub Issue

见 `audit-project-github.md`：
- 为延后项创建 GitHub issue
- 安全问题处理（不创建公开 issue）
- TECHNICAL_DEBT.md 清理

## 错误处理

### 未检测到框架
```
Framework detection failed, using generic patterns.
```

### 无可用测试
```
No test suite detected. Skipping test-quality-guardian.
```

### 所有代理失败
```
ERROR: All review agents failed.
Try: --recent or specific path for smaller scope.
```

## 用法示例

```bash
/audit-project                    # Full review
/audit-project --recent           # Last 5 commits only
/audit-project src/api            # Specific path
/audit-project --domain security  # Security audit only
/audit-project --quick            # Fast feedback, no fixes
/audit-project --create-tech-debt # Force tech debt file
```

## 成功标准

- [OK] 所有代理完成审查
- [OK] 有证据支撑的发现（提供 file:line）
- [OK] critical 问题已修复或已记录
- [OK] 验证通过
- [OK] TECHNICAL_DEBT.md 已更新（如启用）

现在开始阶段 1。
