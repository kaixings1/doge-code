# 阶段 2：多代理审查 - 参考

此文件包含 `/audit-project` 的详细代理协调逻辑。

**父文档**：`audit-project.md`

**审查遍定义**：规范遍定义（核心 + 条件）见 `orchestrate-review` 技能。此命令使用相同的审查遍，但信号从项目结构检测（而不仅仅是变更的文件）。

## 代理专精

### 按代理划分的文件过滤

每个代理只审查相关文件：

| Agent | File Patterns |
|-------|--------------|
| code-quality-reviewer | 所有源文件（包含错误处理） |
| security-expert | 认证、校验、API 端点、配置 |
| performance-engineer | 热路径、算法、循环、查询 |
| test-quality-guardian | 测试文件 + 缺失测试信号 |
| architecture-reviewer | 跨模块边界、核心包 |
| database-specialist | 模型、查询、迁移 |
| api-designer | API 路由、控制器、处理器 |
| frontend-specialist | 组件、状态管理 |
| backend-specialist | 服务、领域逻辑、队列 |
| devops-reviewer | CI/CD 配置、Dockerfile |

## 审查队列文件

在平台状态目录中创建一个临时审查队列文件。审查遍追加 JSONL，或返回 JSON 由父级写入。

```javascript
const path = require('path');
const fs = require('fs');
const { getPluginRoot } = require('@awesome-slash/lib/cross-platform');
const pluginRoot = getPluginRoot('audit-project');
if (!pluginRoot) { console.error('Error: Could not locate audit-project plugin root'); process.exit(1); }
const { getStateDirPath } = require(`${pluginRoot}/lib/platform/state-dir.js`);

const stateDirPath = getStateDirPath(process.cwd());
if (!fs.existsSync(stateDirPath)) {
  fs.mkdirSync(stateDirPath, { recursive: true });
}

function findLatestQueue(dirPath) {
  const files = fs.readdirSync(dirPath)
    .filter(name => name.startsWith('review-queue-') && name.endsWith('.json'))
    .map(name => ({
      name,
      fullPath: path.join(dirPath, name),
      mtime: fs.statSync(path.join(dirPath, name)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.fullPath || null;
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`Review queue unreadable: ${filePath}. Starting fresh.`);
    return null;
  }
}

const resumeRequested = typeof RESUME_MODE !== 'undefined' && RESUME_MODE === 'true';
let reviewQueuePath = resumeRequested ? findLatestQueue(stateDirPath) : null;

if (!reviewQueuePath) {
  reviewQueuePath = path.join(stateDirPath, `review-queue-${Date.now()}.json`);
}

if (!fs.existsSync(reviewQueuePath)) {
  const reviewQueue = {
    status: 'open',
    scope: { type: 'audit', value: SCOPE },
    passes: [],
    items: [],
    iteration: 0,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(reviewQueuePath, JSON.stringify(reviewQueue, null, 2), 'utf8');
} else if (resumeRequested) {
  const reviewQueue = safeReadJson(reviewQueuePath) || {
    status: 'open',
    scope: { type: 'audit', value: SCOPE },
    passes: [],
    items: [],
    iteration: 0,
    updatedAt: new Date().toISOString()
  };
  reviewQueue.status = 'open';
  reviewQueue.resumedAt = new Date().toISOString();
  reviewQueue.updatedAt = new Date().toISOString();
  fs.writeFileSync(reviewQueuePath, JSON.stringify(reviewQueue, null, 2), 'utf8');
}
```

## 代理协调

使用 Task 工具并行启动代理：

```javascript
const agents = [];

const baseReviewPrompt = (passId, role, focus) => `Role: ${role}.

Scope: ${SCOPE}
Framework: ${FRAMEWORK}

Focus on:
${focus.map(item => `- ${item}`).join('\n')}

Write findings to ${reviewQueuePath} (append JSONL if possible). If you cannot write files, return JSON only.

Return JSON ONLY in this format:
{
  "pass": "${passId}",
  "findings": [
    {
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "critical|high|medium|low",
      "category": "${passId}",
      "description": "Issue description",
      "suggestion": "How to fix",
      "confidence": "high|medium|low",
      "falsePositive": false
    }
  ]
}`;

// Always active agents
agents.push(Task({
  subagent_type: "review",
  prompt: baseReviewPrompt('code-quality', 'code quality reviewer', [
    'Code style and consistency',
    'Best practices violations',
    'Potential bugs and logic errors',
    'Error handling and failure paths',
    'Maintainability issues',
    'Code duplication'
  ])
}));

agents.push(Task({
  subagent_type: "review",
  prompt: baseReviewPrompt('security', 'security reviewer', [
    'Auth/authz flaws',
    'Input validation and output encoding',
    'Injection risks (SQL/command/template)',
    'Secrets exposure and unsafe configs',
    'Insecure defaults'
  ])
}));

agents.push(Task({
  subagent_type: "review",
  prompt: baseReviewPrompt('performance', 'performance reviewer', [
    'N+1 queries and inefficient loops',
    'Blocking operations in async paths',
    'Hot path inefficiencies',
    'Memory leaks or unnecessary allocations'
  ])
}));

agents.push(Task({
  subagent_type: "review",
  prompt: baseReviewPrompt('test-coverage', 'test coverage reviewer', [
    'New code without corresponding tests',
    'Missing edge case coverage',
    'Test quality (meaningful assertions)',
    'Integration test needs',
    'Mock/stub appropriateness',
    HAS_TESTS ? 'Existing tests: verify coverage depth' : 'No tests detected: report missing tests'
  ])
}));

// Conditional agents
if (FILE_COUNT > 50) {
  agents.push(Task({
    subagent_type: "review",
    prompt: baseReviewPrompt('architecture', 'architecture reviewer', [
      'Module boundaries and ownership',
      'Dependency direction and layering',
      'Cross-layer coupling',
      'Consistency of patterns'
    ])
  }));
}

if (HAS_DB) {
  agents.push(Task({
    subagent_type: "review",
    prompt: baseReviewPrompt('database', 'database specialist', [
      'Query optimization and N+1 queries',
      'Missing indexes',
      'Transaction handling',
      'Migration safety'
    ])
  }));
}

if (HAS_API) {
  agents.push(Task({
    subagent_type: "review",
    prompt: baseReviewPrompt('api', 'api designer', [
      'REST best practices',
      'Error handling and status codes',
      'Rate limiting and pagination',
      'API versioning'
    ])
  }));
}

if (HAS_FRONTEND) {
  agents.push(Task({
    subagent_type: "review",
    prompt: baseReviewPrompt('frontend', 'frontend specialist', [
      'Component boundaries',
      'State management patterns',
      'Accessibility',
      'Render performance'
    ])
  }));
}

if (HAS_BACKEND) {
  agents.push(Task({
    subagent_type: "review",
    prompt: baseReviewPrompt('backend', 'backend specialist', [
      'Service boundaries',
      'Domain logic correctness',
      'Concurrency and idempotency',
      'Background job safety'
    ])
  }));
}

if (HAS_CICD) {
  agents.push(Task({
    subagent_type: "review",
    prompt: baseReviewPrompt('devops', 'devops reviewer', [
      'CI/CD safety',
      'Secrets handling',
      'Build/test pipelines',
      'Deploy config correctness'
    ])
  }));
}
```

## 发现项合并

所有代理完成后：

```javascript
function consolidateFindings(agentResults) {
  const allFindings = [];

  for (const result of agentResults) {
    const pass = result.pass || 'unknown';
    const findings = Array.isArray(result.findings) ? result.findings : [];
    for (const finding of findings) {
      allFindings.push({
        id: `${pass}:${finding.file}:${finding.line}:${finding.description}`,
        pass,
        ...finding,
        status: finding.falsePositive ? 'false-positive' : 'open'
      });
    }
  }

  // Deduplicate by pass:file:line:description
  const seen = new Set();
  const deduped = allFindings.filter(f => {
    const key = `${f.pass}:${f.file}:${f.line}:${f.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  deduped.sort((a, b) => {
    const aRank = severityOrder[a.severity] ?? 99;
    const bRank = severityOrder[b.severity] ?? 99;
    return aRank - bRank;
  });

  // Update queue file
  const queueState = safeReadJson(reviewQueuePath) || {
    status: 'open',
    scope: { type: 'audit', value: SCOPE },
    passes: [],
    items: [],
    iteration: 0,
    updatedAt: new Date().toISOString()
  };
  queueState.items = deduped;
  queueState.passes = Array.from(new Set(deduped.map(item => item.pass)));
  queueState.updatedAt = new Date().toISOString();
  fs.writeFileSync(reviewQueuePath, JSON.stringify(queueState, null, 2), 'utf8');

  // Group by file
  const byFile = {};
  for (const f of deduped) {
    if (!byFile[f.file]) byFile[f.file] = [];
    byFile[f.file].push(f);
  }

  return {
    all: deduped,
    byFile,
    counts: {
      critical: deduped.filter(f => f.severity === 'critical' && !f.falsePositive).length,
      high: deduped.filter(f => f.severity === 'high' && !f.falsePositive).length,
      medium: deduped.filter(f => f.severity === 'medium' && !f.falsePositive).length,
      low: deduped.filter(f => f.severity === 'low' && !f.falsePositive).length
    }
  };
}
```

## 队列清理

修复并重新审查后，如果没有未解决的问题，则删除队列文件：

```javascript
const queueState = safeReadJson(reviewQueuePath);
if (!queueState) {
  return;
}
const openCount = queueState.items.filter(item => !item.falsePositive).length;
if (openCount === 0) {
  if (fs.existsSync(reviewQueuePath)) {
    try {
      fs.unlinkSync(reviewQueuePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
```

## 框架专属模式

### React 模式

```javascript
const reactPatterns = {
  hooks_rules: {
    description: "React hooks must be called at top level",
    pattern: /use[A-Z]\w+\(/,
    context: "inside conditionals or loops"
  },
  state_management: {
    description: "Avoid prop drilling, use context or state management",
    pattern: /props\.\w+\.\w+\.\w+/
  },
  performance: {
    description: "Use memo/useMemo for expensive computations",
    pattern: /\.map\(.*=>.*\.map\(/
  }
};
```

### Express 模式

```javascript
const expressPatterns = {
  error_handling: {
    description: "Express routes must have error handling",
    pattern: /app\.(get|post|put|delete)\(/,
    check: "next(err) in catch block"
  },
  async_handlers: {
    description: "Async handlers need try-catch or wrapper",
    pattern: /async\s*\(req,\s*res/
  }
};
```

### Django 模式

```javascript
const djangoPatterns = {
  n_plus_one: {
    description: "Use select_related/prefetch_related",
    pattern: /\.objects\.(all|filter)\(\)/
  },
  raw_queries: {
    description: "Avoid raw SQL, use ORM",
    pattern: /\.raw\(|connection\.cursor\(\)/
  }
};
```

## 模式应用

```javascript
function applyPatterns(findings, frameworkPatterns) {
  if (!frameworkPatterns) return findings;

  for (const pattern of Object.values(frameworkPatterns)) {
    // Check each finding against framework patterns
    for (const finding of findings) {
      if (pattern.pattern.test(finding.codeQuote)) {
        finding.frameworkContext = pattern.description;
      }
    }
  }

  return findings;
}
```

## 审查输出格式

```markdown
## Agent Reports

### security-expert
**Files Reviewed**: X
**Issues Found**: Y (Z critical, A high)

Findings:
1. [Finding details with file:line]
2. [Finding details with file:line]

### performance-engineer
**Files Reviewed**: X
**Issues Found**: Y

Findings:
1. [Finding details with file:line]

[... per agent]

## Consolidated Summary

**Total Issues**: X
- Critical: Y（必须修复）
- High: Z（应当修复）
- Medium: A（考虑）
- Low: B（可选改进）

**Top Files by Issue Count**:
1. src/api/users.ts: 5 issues
2. src/auth/session.ts: 3 issues
```
