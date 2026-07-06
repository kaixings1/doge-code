---
name: context-window-management
description: "Context Window Management — Context Window Management 相关功能和最佳实践"
  summarization, trimming, routing, and avoiding context rot
risk: unknown
source: vibeship-spawner-skills (Apache 2.0)
date_added: 2026-02-27
---

# 上下文窗口管理

管理 LLM 上下文窗口的策略 including summarization, trimming, routing, and avoiding context rot

## 能力

- context-engineering
- context-summarization
- context-trimming
- context-routing
- 令牌-counting
- context-prioritization

## 前提条件

- Knowledge: LLM fundamentals, Tokenization basics, Prompt engineering
- Skills_recommended: prompt-engineering

## 范围

- Does_not_cover: RAG implementation details, Model fine-tuning, Embedding models
- Boundaries: Focus is context optimization, Covers strategies not specific implementations

## 生态系统

### Primary_tools

- tiktoken - OpenAI's tokenizer for counting tokens
- LangChain - Framework with context management utilities
- Claude API - 200K+ context with caching support

## 模式

### 分层上下文策略

Different strategies based on context size

**When to use**: Building any multi-turn conversation system

interface ContextTier {
    maxTokens: number;
    strategy: 'full' | 'summarize' | 'rag';
    model: string;
}

const TIERS: ContextTier[] = [
    { maxTokens: 8000, strategy: 'full', model: 'claude-3-haiku' },
    { maxTokens: 32000, strategy: 'full', model: 'claude-3-5-sonnet' },
    { maxTokens: 100000, strategy: 'summarize', model: 'claude-3-5-sonnet' },
    { maxTokens: Infinity, strategy: 'rag', model: 'claude-3-5-sonnet' }
];

async function selectStrategy(messages: Message[]): ContextTier {
    const tokens = await countTokens(messages);

    for (const tier of TIERS) {
        if (tokens <= tier.maxTokens) {
            return tier;
        }
    }
    return TIERS[TIERS.length - 1];
}

async function prepareContext(messages: Message[]): PreparedContext {
    const tier = await selectStrategy(messages);

    switch (tier.strategy) {
        case 'full':
            return { messages, model: tier.model };

        case 'summarize':
            const summary = await summarizeOldMessages(messages);
            return { messages: [summary, ...recentMessages(messages)], model: tier.model };

        case 'rag':
            const relevant = await retrieveRelevant(messages);
            return { messages: [...relevant, ...recentMessages(messages)], model: tier.model };
    }
}

### 序列位置优化

Place important content at start and end

**When to use**: Constructing prompts with significant context

// LLMs weight beginning and end more heavily
// Structure prompts to leverage this

function buildOptimalPrompt(components: {
    systemPrompt: string;
    criticalContext: string;
    conversationHistory: Message[];
    currentQuery: string;
}): string {
    // START: System instructions (always first)
    const parts = [components.systemPrompt];

    // CRITICAL CONTEXT: Right after system (high primacy)
    if (components.criticalContext) {
        parts.push(`## Key Context\n${components.criticalContext}`);
    }

    // MIDDLE: Conversation history (lower weight)
    // Summarize if long, keep recent messages full
    const history = components.conversationHistory;
    if (history.length > 10) {
        const oldSummary = summarize(history.slice(0, -5));
        const recent = history.slice(-5);
        parts.push(`## Earlier Conversation (Summary)\n${oldSummary}`);
        parts.push(`## Recent Messages\n${formatMessages(recent)}`);
    } else {
        parts.push(`## Conversation\n${formatMessages(history)}`);
    }

    // END: Current 查询 (high recency)
    // Restate critical requirements here
    parts.push(`## Current 请求\n${components.currentQuery}`);

    // FINAL: Reminder of key constraints
    parts.push(`Remember: ${extractKeyConstraints(components.systemPrompt)}`);

    return parts.join('\n\n');
}

### 智能摘要

Summarize by importance, not just recency

**When to use**: Context exceeds optimal size

interface MessageWithMetadata extends Message {
    importance: number;  // 0-1 score
    hasCriticalInfo: boolean;  // User preferences, decisions
    referenced: boolean;  // Was this referenced later?
}

async function smartSummarize(
    messages: MessageWithMetadata[],
    targetTokens: number
): Message[] {
    // Sort by importance, preserve order for tied scores
    const sorted = [...messages].sort((a, b) =>
        (b.importance + (b.hasCriticalInfo ? 0.5 : 0) + (b.referenced ? 0.3 : 0)) -
        (a.importance + (a.hasCriticalInfo ? 0.5 : 0) + (a.referenced ? 0.3 : 0))
    );

    const keep: Message[] = [];
    const summarizePool: Message[] = [];
    let currentTokens = 0;

    for (const msg of sorted) {
        const msgTokens = await countTokens([msg]);
        if (currentTokens + msgTokens < targetTokens * 0.7) {
            keep.push(msg);
            currentTokens += msgTokens;
        } else {
            summarizePool.push(msg);
        }
    }

    // Summarize the low-importance messages
    if (summarizePool.length > 0) {
        const summary = await llm.complete(`
            Summarize these messages, preserving:
            - Any user preferences or decisions
            - Key facts that might be referenced later
            - The overall flow of conversation

            Messages:
            ${formatMessages(summarizePool)}
        `);

        keep.unshift({ role: 'system', content: `[Earlier context: ${summary}]` });
    }

    // Restore original order
    return keep.sort((a, b) => a.timestamp - b.timestamp);
}

### 令牌 预算分配

Allocate 令牌 budget across context components

**When to use**: Need predictable context management

interface TokenBudget {
    system: number;      // System prompt
    criticalContext: number;  // User prefs, key info
    history: number;     // Conversation history
    查询: number;       // Current 查询
    响应: number;    // Reserved for 响应
}

function allocateBudget(totalTokens: number): TokenBudget {
    return {
        system: Math.floor(totalTokens * 0.10),      // 10%
        criticalContext: Math.floor(totalTokens * 0.15),  // 15%
        history: Math.floor(totalTokens * 0.40),     // 40%
        查询: Math.floor(totalTokens * 0.10),       // 10%
        响应: Math.floor(totalTokens * 0.25),    // 25%
    };
}

async function buildWithBudget(
    components: ContextComponents,
    modelMaxTokens: number
): PreparedContext {
    const budget = allocateBudget(modelMaxTokens);

    // Truncate/summarize each component to fit budget
    const prepared = {
        system: truncateToTokens(components.system, budget.system),
        criticalContext: truncateToTokens(
            components.criticalContext, budget.criticalContext
        ),
        history: await summarizeToTokens(components.history, budget.history),
        查询: truncateToTokens(components.查询, budget.查询),
    };

    // Reallocate unused budget
    const used = await countTokens(Object.values(prepared).join('\n'));
    const remaining = modelMaxTokens - used - budget.响应;

    if (remaining > 0) {
        // Give extra to history (most valuable for conversation)
        prepared.history = await summarizeToTokens(
            components.history,
            budget.history + remaining
        );
    }

    return prepared;
}

## 验证检查

### No 令牌 Counting

Severity: WARNING

Message: Building context without 令牌 counting. May exceed model limits.

Fix action: Count tokens before sending, implement budget allocation

### Naive Message Truncation

Severity: WARNING

Message: Truncating messages without summarization. Critical context may be lost.

Fix action: Summarize old messages instead of simply removing them

### Hardcoded 令牌 Limit

Severity: INFO

Message: Hardcoded 令牌 limit. Consider making configurable per model.

Fix action: Use model-specific limits from 配置

### No Context Management Strategy

Severity: WARNING

Message: LLM calls without context management strategy.

Fix action: Implement context management: budgets, summarization, or RAG

## 协作

### 委托触发器

- retrieval|rag|search -> rag-implementation (Need retrieval system)
- memory|persistence|remember -> conversation-memory (Need memory storage)
- cache|caching -> prompt-caching (Need caching optimization)

### 完整上下文系统

Skills: context-window-management, rag-implementation, conversation-memory, prompt-caching

工作流:

```
1. Design context strategy
2. Implement RAG for large corpuses
3. Set up memory persistence
4. Add caching for performance
```

## 相关技能

Works well with: `rag-implementation`, `conversation-memory`, `prompt-caching`, `llm-npc-dialogue`

## 何时使用
- User mentions or implies: context window
- User mentions or implies: 令牌 limit
- User mentions or implies: context management
- User mentions or implies: context engineering
- User mentions or implies: long context
- User mentions or implies: context overflow

## 限制
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
