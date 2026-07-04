---
name: context-optimization
description: "上下文优化通过策略性压缩、掩码、缓存和分区来扩展有限上下文窗口的有效容量。目标不是神奇地增加上下文窗口，而是更好地利用可用容量。"
risk: unknown
source: community
---

# 上下文 Optimization Techniques

上下文 optimization extends the effective capacity of limited context windows through strategic compression, masking, caching, and partitioning. The goal is not to magically increase context windows but to make better use of available capacity. Effective optimization can double or triple effective context capacity without requiring larger models or longer contexts.

## 何时使用
Activate this skill when:
- 上下文 limits constrain task complexity
- Optimizing for cost reduction (fewer tokens = lower costs)
- Reducing latency for long conversations
- Implementing long-running agent systems
- Needing to handle larger documents or conversations
- Building production systems at scale

## 核心概念

上下文 optimization extends effective capacity through four primary strategies: compaction (summarizing context near limits), observation masking (replacing verbose outputs with references), KV-cache optimization (reusing cached computations), and context partitioning (splitting work across isolated contexts).

The key insight is that context quality matters more than quantity. Optimization preserves signal while reducing noise. The art lies in selecting what to keep versus what to discard, and when to apply each technique.

## Detailed Topics

### Compaction Strategies

**What is Compaction**
Compaction is the practice of summarizing context contents when approaching limits, then reinitializing a new context window with the summary. This distills the contents of a context window in a high-fidelity manner, enabling the agent to continue with minimal performance degradation.

Compaction typically serves as the first lever in context optimization. The art lies in selecting what to keep versus what to discard.

**Compaction Implementation**
Compaction works by identifying sections that can be compressed, generating summaries that capture essential points, and replacing full content with summaries. Priority for compression goes to tool outputs (replace with summaries), old turns (summarize early conversation), retrieved docs (summarize if recent versions exist), and never compress system prompt.

**总结 Generation**
Effective summaries preserve different elements depending on message type:

Tool outputs: Preserve key findings, metrics, and conclusions. Remove verbose raw output.

Conversational turns: Preserve key decisions, commitments, and context shifts. Remove filler and back-and-forth.

Retrieved documents: Preserve key facts and claims. Remove supporting evidence and elaboration.

### Observation Masking

**The Observation Problem**
Tool outputs can comprise 80%+ of token usage in agent trajectories. Much of this is verbose output that has already served its purpose. Once an agent has used a tool output to make a decision, keeping the full output provides diminishing value while consuming significant context.

Observation masking replaces verbose tool outputs with compact references. The information remains accessible if needed but does not consume context continuously.

**Masking Strategy Selection**
Not all observations should be masked equally:

绝不 mask: Observations critical to current task, observations from the most recent turn, observations used in active reasoning.

考虑 masking: Observations from 3+ turns ago, verbose outputs with key points extractable, observations whose purpose has been served.

始终 mask: Repeated outputs, boilerplate headers/footers, outputs already summarized in conversation.

### KV-Cache Optimization

**Understanding KV-Cache**
The KV-cache stores Key and Value tensors computed during inference, growing linearly with sequence length. Caching the KV-cache across requests sharing identical prefixes avoids recomputation.

Prefix caching reuses KV blocks across requests with identical prefixes using hash-based block matching. This dramatically reduces cost and latency for requests with common prefixes like system prompts.

**Cache Optimization Patterns**
Optimize for caching by reordering context elements to maximize cache hits. Place stable elements first (system prompt, tool definitions), then frequently reused elements, then unique elements last.

Design prompts to maximize cache stability: avoid dynamic content like timestamps, use consistent formatting, keep structure stable across sessions.

### 上下文 Partitioning

**Sub-Agent Partitioning**
The most aggressive form of context optimization is partitioning work across sub-agents with isolated contexts. Each sub-agent operates in a clean context focused on its subtask without carrying accumulated context from other subtasks.

This approach achieves separation of concerns—the detailed search context remains isolated within sub-agents while the coordinator focuses on synthesis and analysis.

**Result Aggregation**
Aggregate results from partitioned subtasks by validating all partitions completed, merging compatible results, and summarizing if still too large.

### Budget Management

**上下文 Budget Allocation**
Design explicit context budgets. Allocate tokens to categories: system prompt, tool definitions, retrieved docs, message history, and reserved buffer. Monitor usage against budget and trigger optimization when approaching limits.

**Trigger-Based Optimization**
Monitor signals for optimization triggers: token utilization above 80%, degradation indicators, and performance drops. Apply appropriate optimization techniques based on context composition.

## Practical Guidance

### Optimization Decision Framework

When to optimize:
- 上下文 utilization exceeds 70%
- Response quality degrades as conversations extend
- Costs increase due to long contexts
- Latency increases with conversation length

What to apply:
- Tool outputs dominate: observation masking
- Retrieved documents dominate: summarization or partitioning
- Message history dominates: compaction with summarization
- Multiple components: combine strategies

### 性能 考虑ations

Compaction should achieve 50-70% token reduction with less than 5% quality degradation. Masking should achieve 60-80% reduction in masked observations. Cache optimization should achieve 70%+ hit rate for stable workloads.

Monitor and iterate on optimization strategies based on measured effectiveness.

## 示例

**Example 1: Compaction Trigger**
```python
if context_tokens / context_limit > 0.8:
    context = compact_context(context)
```

**Example 2: Observation Masking**
```python
if len(observation) > max_length:
    ref_id = store_observation(observation)
    return f"[Obs:{ref_id} elided. Key: {extract_key(observation)}]"
```

**Example 3: Cache-Friendly Ordering**
```python
# Stable content first
context = [system_prompt, tool_definitions]  # Cacheable
context += [reused_templates]  # Reusable
context += [unique_content]  # Unique
```

## Guidelines

1. Measure before optimizing—know your current state
2. Apply compaction before masking when possible
3. Design for cache stability with consistent prompts
4. Partition before context becomes problematic
5. Monitor optimization effectiveness over time
6. Balance token savings against quality preservation
7. Test optimization at production scale
8. Implement graceful degradation for edge cases

## 集成

This skill builds on context-fundamentals and context-degradation. It connects to:

- multi-agent-patterns - Partitioning as isolation
- evaluation - Measuring optimization effectiveness
- memory-systems - Offloading context to memory

## 参考资料

Internal reference:
- Optimization Techniques Reference - Detailed technical reference

相关 skills in this collection:
- context-fundamentals - 上下文 basics
- context-degradation - Understanding when to optimize
- evaluation - Measuring optimization

External resources:
- Research on context window limitations
- KV-cache optimization techniques
- Production engineering guides

---

## Skill Metadata

**Created**: 2025-12-20
**Last Updated**: 2025-12-20
**Author**: Agent Skills for 上下文 Engineering Contributors
**Version**: 1.0.0

## 限制
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
