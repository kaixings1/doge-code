---
name: 当代理会话生成数百万 令牌 的对话历史时，压缩变得必要
description: "当代理会话生成数百万 令牌 的对话历史时，压缩变得必要。天真的方法是激进压缩以最小化每请求 令牌 数。"
risk: unknown
source: community
---

# Context Compression Strategies

When agent sessions generate millions of tokens of conversation history, compression becomes mandatory. The naive 方法 is aggressive compression to minimize tokens per 请求. The correct optimization target is tokens per task: total tokens consumed to complete a task, including re-fetching costs when compression loses critical information.

## 何时使用
Activate this skill when:
- Agent sessions exceed context window limits
- Codebases exceed context windows (5M+ 令牌 systems)
- Designing conversation summarization strategies
- Debugging cases where agents "forget" what files they modified
- Building evaluation frameworks for compression quality

## 核心概念

Context compression trades 令牌 savings against information loss. Three production-ready approaches exist:

1. **Anchored Iterative Summarization**: Maintain structured, persistent summaries with explicit sections for 会话 intent, file modifications, decisions, and next steps. When compression triggers, summarize only the newly-truncated span and merge with the existing summary. Structure forces preservation by dedicating sections to specific information types.

2. **Opaque Compression**: Produce compressed representations optimized for reconstruction fidelity. Achieves highest compression ratios (99%+) but sacrifices interpretability. Cannot verify what was preserved.

3. **Regenerative Full Summary**: Generate detailed structured summaries on each compression. Produces readable output but may lose details across repeated compression cycles due to full regeneration rather than incremental merging.

The critical insight: structure forces preservation. Dedicated sections act as checklists that the summarizer must populate, preventing silent information drift.

## 详细主题

### Why Tokens-Per-Task Matters

Traditional compression metrics target tokens-per-请求. This is the wrong optimization. When compression loses critical details like file paths or error messages, the agent must re-fetch information, re-explore approaches, and waste tokens recovering context.

The right metric is tokens-per-task: total tokens consumed from task start to completion. A compression strategy saving 0.5% more tokens but causing 20% more re-fetching costs more overall.

### The Artifact Trail Problem

Artifact trail integrity is the weakest dimension across all compression methods, scoring 2.2-2.5 out of 5.0 in evaluations. Even structured summarization with explicit file sections struggles to maintain complete file tracking across long sessions.

Coding agents need to know:
- Which files were created
- Which files were modified and what changed
- Which files were read but not changed
- Function names, variable names, error messages

This problem likely requires specialized handling beyond general summarization: a separate artifact index or explicit file-state tracking in agent scaffolding.

### Structured Summary Sections

Effective structured summaries include explicit sections:

```markdown
## 会话 Intent
[What the user is trying to accomplish]

## Files Modified
- auth.controller.ts: Fixed JWT 令牌 generation
- config/redis.ts: Updated connection pooling
- tests/auth.test.ts: Added mock 设置 for new config

## Decisions Made
- Using Redis connection pool instead of per-请求 connections
- Retry logic with exponential backoff for transient failures

## Current State
- 14 tests passing, 2 failing
- Remaining: mock 设置 for 会话 service tests

## 后续步骤
1. Fix remaining test failures
2. Run full test suite
3. Update documentation
```

This structure prevents silent loss of file paths or decisions because each section must be explicitly addressed.

### Compression Trigger Strategies

When to trigger compression matters as much as how to compress:

| Strategy | Trigger Point | Trade-off |
|----------|---------------|-----------|
| Fixed threshold | 70-80% context utilization | Simple but may compress too early |
| Sliding window | Keep last N turns + summary | Predictable context size |
| Importance-based | Compress low-relevance sections first | Complex but preserves signal |
| Task-boundary | Compress at logical task completions | Clean summaries but unpredictable timing |

The sliding window 方法 with structured summaries provides the best balance of predictability and quality for most coding agent use cases.

### Probe-Based Evaluation

Traditional metrics like ROUGE or embedding similarity fail to capture functional compression quality. A summary may score high on lexical overlap while missing the one file path the agent needs.

Probe-based evaluation directly measures functional quality by asking questions after compression:

| Probe Type | What It Tests | Example Question |
|------------|---------------|------------------|
| Recall | Factual retention | "What was the original error message?" |
| Artifact | File tracking | "Which files have we modified?" |
| Continuation | Task planning | "What should we do next?" |
| Decision | Reasoning chain | "What did we decide about the Redis issue?" |

If compression preserved the right information, the agent answers correctly. If not, it guesses or hallucinates.

### Evaluation Dimensions

Six dimensions capture compression quality for coding agents:

1. **Accuracy**: Are technical details correct? File paths, function names, error codes.
2. **Context Awareness**: Does the 响应 reflect current conversation state?
3. **Artifact Trail**: Does the agent know which files were read or modified?
4. **Completeness**: Does the 响应 address all parts of the question?
5. **Continuity**: Can work continue without re-fetching information?
6. **Instruction Following**: Does the 响应 respect stated constraints?

Accuracy shows the largest variation between compression methods (0.6 point gap). Artifact trail is universally weak (2.2-2.5 range).

## Practical Guidance

### Three-Phase Compression 工作流

For large codebases or agent systems exceeding context windows, apply compression through three phases:

1. **Research Phase**: Produce a research document from architecture diagrams, documentation, and key interfaces. Compress exploration into a structured analysis of components and dependencies. Output: single research document.

2. **Planning Phase**: Convert research into implementation specification with function signatures, type definitions, and data flow. A 5M 令牌 codebase compresses to approximately 2,000 words of specification.

3. **Implementation Phase**: Execute against the specification. Context remains focused on the spec rather than raw codebase exploration.

### Using Example Artifacts as Seeds

When provided with a manual 迁移 example or reference PR, use it as a template to understand the target pattern. The example reveals constraints that static analysis cannot surface: which invariants must hold, which services break on changes, and what a clean 迁移 looks like.

This is particularly important when the agent cannot distinguish essential complexity (business requirements) from accidental complexity (legacy workarounds). The example artifact encodes that distinction.

### Implementing Anchored Iterative Summarization

1. Define explicit summary sections matching your agent's needs
2. On first compression trigger, summarize truncated history into sections
3. On subsequent compressions, summarize only new truncated content
4. Merge new summary into existing sections rather than regenerating
5. Track which information came from which compression cycle for debugging

### 何时使用 Each 方法

**Use anchored iterative summarization when:**
- Sessions are long-running (100+ messages)
- File tracking matters (coding, debugging)
- You need to verify what was preserved

**Use opaque compression when:**
- Maximum 令牌 savings required
- Sessions are relatively short
- Re-fetching costs are low

**Use regenerative summaries when:**
- Summary interpretability is critical
- Sessions have clear phase boundaries
- Full context review is acceptable on each compression

### Compression Ratio Considerations

| Method | Compression Ratio | Quality Score | Trade-off |
|--------|-------------------|---------------|-----------|
| Anchored Iterative | 98.6% | 3.70 | Best quality, slightly less compression |
| Regenerative | 98.7% | 3.44 | Good quality, moderate compression |
| Opaque | 99.3% | 3.35 | Best compression, quality loss |

The 0.7% additional tokens retained by structured summarization buys 0.35 quality points. For any task where re-fetching costs matter, this trade-off favors structured approaches.

## 示例

**Example 1: Debugging 会话 Compression**

Original context (89,000 tokens, 178 messages):
- 401 error on /api/auth/login 端点
- Traced through auth controller, 中间件, 会话 store
- Found stale Redis connection
- Fixed connection pooling, added retry logic
- 14 tests passing, 2 failing

Structured summary after compression:

```markdown
## 会话 Intent
Debug 401 Unauthorized error on /api/auth/login despite valid credentials.

## Root Cause
Stale Redis connection in 会话 store. JWT generated correctly but 会话 could not be persisted.

## Files Modified
- auth.controller.ts: No changes (read only)
- 中间件/cors.ts: No changes (examined)
- config/redis.ts: Fixed connection pooling 配置
- services/会话.service.ts: Added retry logic for transient failures
- tests/auth.test.ts: Updated mock 设置

## Test Status
14 passing, 2 failing (mock 设置 issues)

## 后续步骤
1. Fix remaining test failures (mock 会话 service)
2. Run full test suite
3. Deploy to staging
```

**Example 2: Probe 响应 Quality**

After compression, asking "What was the original error?":

Good 响应 (structured summarization):
> "The original error was a 401 Unauthorized 响应 from the /api/auth/login 端点. Users received this error with valid credentials. Root cause was stale Redis connection in 会话 store."

Poor 响应 (aggressive compression):
> "We were debugging an 认证 issue. The login was failing. We fixed some 配置 problems."

The structured 响应 preserves 端点, error code, and root cause. The aggressive 响应 loses all technical detail.

## Guidelines

1. Optimize for tokens-per-task, not tokens-per-请求
2. Use structured summaries with explicit sections for file tracking
3. Trigger compression at 70-80% context utilization
4. Implement incremental merging rather than full regeneration
5. Test compression quality with probe-based evaluation
6. Track artifact trail separately if file tracking is critical
7. Accept slightly lower compression ratios for better quality retention
8. Monitor re-fetching frequency as a compression quality signal

## 集成

This skill connects to several others in the collection:

- context-degradation - Compression is a mitigation strategy for degradation
- context-optimization - Compression is one optimization technique among many
- evaluation - Probe-based evaluation applies to compression testing
- memory-systems - Compression relates to scratchpad and summary memory patterns

## 参考

Internal reference:
- Evaluation Framework Reference - Detailed probe types and scoring rubrics

Related skills in this collection:
- context-degradation - Understanding what compression prevents
- context-optimization - Broader optimization strategies
- evaluation - Building evaluation frameworks

External resources:
- Factory Research: Evaluating Context Compression for AI Agents (December 2025)
- Research on LLM-as-judge evaluation methodology (Zheng et al., 2023)
- Netflix Engineering: "The Infinite Software Crisis" - Three-phase 工作流 and context compression at scale (AI Summit 2025)

---

## Skill Metadata

**Created**: 2025-12-22
**Last Updated**: 2025-12-26
**Author**: Agent Skills for Context Engineering Contributors
**Version**: 1.1.0

## 限制
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
