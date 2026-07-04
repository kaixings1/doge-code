---
name: filesystem-context
description: "Filesystem Context — Filesystem Context 相关功能和最佳实践"
risk: unknown
source: community
---

# 基于文件系统的上下文工程

文件系统提供了一个单一接口，通过该接口代理可以灵活地存储、检索和更新实际上无限量的上下文。这种模式解决了上下文窗口有限的基本约束，而任务通常需要比单个窗口容纳的更多信息。

核心见解是文件支持动态上下文发现：代理按需拉取相关上下文，而不是在上下文窗口中携带所有内容。这与静态上下文形成对比，后者无论相关性如何都始终包含。

## 何时使用
在以下情况激活此技能：
- 工具输出使上下文窗口膨胀
- 代理需要在长轨迹中持久化状态
- 子代理必须在不直接消息传递的情况下共享信息
- 任务需要的上下文超过窗口容量
- 构建学习并更新自身指令的代理
- 为中间结果实现草稿板
- 终端输出或日志需要可被代理访问

## 核心概念

上下文工程可能以四种可预测的方式失败。首先，当代理需要的上下文不在总可用上下文中时。其次，当检索到的上下文未能封装所需上下文时。第三，当检索到的上下文远超过所需上下文时，浪费令牌并降低性能。第四，当代理无法发现埋藏在许多文件中的小众信息时。

文件系统通过提供持久层来解决这些失败，代理可以在其中写入一次并有选择地读取，卸载大量内容，同时保留通过搜索工具检索特定信息的能力。

## /u8be6/u7ec6/u4e3b/u9898

### /u9759/u6001/u4e0e/u52a8/u6001/u4e0a/u4e0b/u6587/u7684/u6743/u8861

**Static Context**
Static context is always included in the prompt: system instructions, tool definitions, and critical rules. Static context consumes tokens regardless of task relevance. As agents accumulate more capabilities (tools, skills, instructions), static context grows and crowds out space for dynamic information.

**Dynamic Context Discovery**
Dynamic context is loaded on-demand when relevant to the current task. The agent receives minimal static pointers (names, descriptions, file paths) and uses search tools to load full content when needed.

Dynamic discovery is more token-efficient because only necessary data enters the context window. It can also improve response quality by reducing potentially confusing or contradictory information.

The trade-off: dynamic discovery requires the model to correctly identify when to load additional context. This works well with current frontier models but may fail with less capable models that do not recognize when they need more information.

### /u6a21/u5f0f 1/uff1a/u6587/u4ef6/u7cfb/u7edf/u4f5c/u4e3a/u8349/u7a3f/u677f

**The Problem**
Tool calls can return massive outputs. A web search may return 10k tokens of raw content. A database query may return hundreds of rows. If this content enters the message history, it remains for the entire conversation, inflating token costs and potentially degrading attention to more relevant information.

**The Solution**
Write large tool outputs to files instead of returning them directly to the context. The agent then uses targeted retrieval (grep, line-specific reads) to extract only the relevant portions.

**Implementation**
```python
def handle_tool_output(output: str, threshold: int = 2000) -> str:
    if len(output) < threshold:
        return output
    
    # Write to scratch pad
    file_path = f"scratch/{tool_name}_{timestamp}.txt"
    write_file(file_path, output)
    
    # Return reference instead of content
    key_summary = extract_summary(output, max_tokens=200)
    return f"[Output written to {file_path}. Summary: {key_summary}]"
```

The agent can then use `grep` to search for specific patterns or `read_file` with line ranges to retrieve targeted sections.

**Benefits**
- Reduces token accumulation over long conversations
- Preserves full output for later reference
- Enables targeted retrieval instead of carrying everything

### /u6a21/u5f0f 2/uff1a/u8ba1/u5212/u6301/u4e45/u5316

**The Problem**
Long-horizon tasks require agents to make plans and follow them. But as conversations extend, plans can fall out of attention or be lost to summarization. The agent loses track of what it was supposed to do.

**The Solution**
Write plans to the filesystem. The agent can re-read its plan at any point, reminding itself of the current objective and progress. This is sometimes called "manipulating attention through recitation."

**Implementation**
Store plans in structured format:
```yaml
# scratch/current_plan.yaml
objective: "Refactor authentication module"
status: in_progress
steps:
  - id: 1
    description: "Audit current auth endpoints"
    status: completed
  - id: 2
    description: "Design new token validation flow"
    status: in_progress
  - id: 3
    description: "Implement and test changes"
    status: pending
```

The agent reads this file at the start of each turn or when it needs to re-orient.

### /u6a21/u5f0f 3/uff1a/u901a/u8fc7/u6587/u4ef6/u7cfb/u7edf/u7684/u5b50/u4ee3/u7406/u901a/u4fe1

**The Problem**
In multi-agent systems, sub-agents typically report findings to a coordinator agent through message passing. This creates a "game of telephone" where information degrades through summarization at each hop.

**The Solution**
Sub-agents write their findings directly to the filesystem. The coordinator reads these files directly, bypassing intermediate message passing. This preserves fidelity and reduces context accumulation in the coordinator.

**Implementation**
```
workspace/
  agents/
    research_agent/
      findings.md        # Research agent writes here
      sources.jsonl      # Source tracking
    code_agent/
      changes.md         # Code agent writes here
      test_results.txt   # Test output
  coordinator/
    synthesis.md         # Coordinator reads agent outputs, writes synthesis
```

Each agent operates in relative isolation but shares state through the filesystem.

### /u6a21/u5f0f 4/uff1a/u52a8/u6001/u6280/u80fd/u52a0/u8f7d

**The Problem**
Agents may have many skills or instruction sets, but most are irrelevant to any given task. Stuffing all instructions into the system prompt wastes tokens and can confuse the model with contradictory or irrelevant guidance.

**The Solution**
Store skills as files. Include only skill names and brief descriptions in static context. The agent uses search tools to load relevant skill content when the task requires it.

**Implementation**
Static context includes:
```
Available skills (load with read_file when relevant):
- database-optimization: Query tuning and indexing strategies
- api-design: REST/GraphQL best practices
- testing-strategies: Unit, integration, and e2e testing patterns
```

Agent loads `skills/database-optimization/SKILL.md` only when working on database tasks.

### /u6a21/u5f0f 5/uff1a/u7ec8/u7aef/u548c/u65e5/u5fd7/u6301/u4e45/u5316

**The Problem**
Terminal output from long-running processes accumulates rapidly. Copying and pasting output into agent input is manual and inefficient.

**The Solution**
Sync terminal output to files automatically. The agent can then grep for relevant sections (error messages, specific commands) without loading entire terminal histories.

**Implementation**
Terminal sessions are persisted as files:
```
terminals/
  1.txt    # Terminal session 1 output
  2.txt    # Terminal session 2 output
```

Agents query with targeted grep:
```bash
grep -A 5 "error" terminals/1.txt
```

### /u6a21/u5f0f 6/uff1a/u901a/u8fc7/u81ea/u6211/u4fee/u6539/u5b66/u4e60

**The Problem**
Agents often lack context that users provide implicitly or explicitly during interactions. Traditionally, this requires manual system prompt updates between sessions.

**The Solution**
Agents write learned information to their own instruction files. Subsequent sessions load these files, incorporating learned context automatically.

**Implementation**
After user provides preference:
```python
def remember_preference(key: str, value: str):
    preferences_file = "agent/user_preferences.yaml"
    prefs = load_yaml(preferences_file)
    prefs[key] = value
    write_yaml(preferences_file, prefs)
```

Subsequent sessions include a step to load user preferences if the file exists.

**Caution**
This pattern is still emerging. Self-modification requires careful guardrails to prevent agents from accumulating incorrect or contradictory instructions over time.

### /u6587/u4ef6/u7cfb/u7edf/u641c/u7d22/u6280/u672f

Models are specifically trained to understand filesystem traversal. The combination of `ls`, `glob`, `grep`, and `read_file` with line ranges provides powerful context discovery:

- `ls` / `list_dir`: Discover directory structure
- `glob`: Find files matching patterns (e.g., `**/*.py`)
- `grep`: Search file contents for patterns, returns matching lines
- `read_file` with ranges: Read specific line ranges without loading entire files

This combination often outperforms semantic search for technical content (code, API docs) where semantic meaning is sparse but structural patterns are clear.

Semantic search and filesystem search work well together: semantic search for conceptual queries, filesystem search for structural and exact-match queries.

## /u5b9e/u7528/u6307/u5357

### When to Use Filesystem Context

**Use filesystem patterns when:**
- Tool outputs exceed 2000 tokens
- Tasks span multiple conversation turns
- Multiple agents need to share state
- Skills or instructions exceed what fits comfortably in system prompt
- Logs or terminal output need selective querying

**Avoid filesystem patterns when:**
- Tasks complete in single turns
- Context fits comfortably in window
- Latency is critical (file I/O adds overhead)
- Simple model incapable of filesystem tool use

### File Organization

Structure files for discoverability:
```
project/
  scratch/           # Temporary working files
    tool_outputs/    # Large tool results
    plans/           # Active plans and checklists
  memory/            # Persistent learned information
    preferences.yaml # User preferences
    patterns.md      # Learned patterns
  skills/            # Loadable skill definitions
  agents/            # Sub-agent workspaces
```

Use consistent naming conventions. Include timestamps or IDs in scratch files for disambiguation.

### Token Accounting

Track where tokens originate:
- Measure static vs dynamic context ratio
- Monitor tool output sizes before and after offloading
- Track how often dynamic context is actually loaded

Optimize based on measurements, not assumptions.

## /u793a/u4f8b

**Example 1: Tool Output Offloading**
```
Input: Web search returns 8000 tokens
Before: 8000 tokens added to message history
After: 
  - Write to scratch/search_results_001.txt
  - Return: "[Results in scratch/search_results_001.txt. Key finding: API rate limit is 1000 req/min]"
  - Agent greps file when needing specific details
Result: ~100 tokens in context, 8000 tokens accessible on demand
```

**Example 2: Dynamic Skill Loading**
```
Input: User asks about database indexing
Static context: "database-optimization: Query tuning and indexing"
Agent action: read_file("skills/database-optimization/SKILL.md")
Result: Full skill loaded only when relevant
```

**Example 3: Chat History as File Reference**
```
Trigger: Context window limit reached, summarization required
Action: 
  1. Write full history to history/session_001.txt
  2. Generate summary for new context window
  3. Include reference: "Full history in history/session_001.txt"
Result: Agent can search history file to recover details lost in summarization
```

## /u89c4/u8303

1. Write large outputs to files; return summaries and references to context
2. Store plans and state in structured files for re-reading
3. Use sub-agent file workspaces instead of message chains
4. Load skills dynamically rather than stuffing all into system prompt
5. Persist terminal and log output as searchable files
6. Combine grep/glob with semantic search for comprehensive discovery
7. Organize files for agent discoverability with clear naming
8. Measure token savings to validate filesystem patterns are effective
9. Implement cleanup for scratch files to prevent unbounded growth
10. Guard self-modification patterns with validation

## /u96c6/u6210

This skill connects to:

- context-optimization - Filesystem offloading is a form of observation masking
- memory-systems - Filesystem-as-memory is a simple memory layer
- multi-agent-patterns - Sub-agent file workspaces enable isolation
- context-compression - File references enable lossless "compression"
- tool-design - Tools should return file references for large outputs

## /u53c2/u8003

Internal reference:
- Implementation Patterns - Detailed pattern implementations

Related skills in this collection:
- context-optimization - Token reduction techniques
- memory-systems - Persistent storage patterns
- multi-agent-patterns - Agent coordination

External resources:
- LangChain Deep Agents: How agents can use filesystems for context engineering
- Cursor: Dynamic context discovery patterns
- Anthropic: Agent Skills specification

---

## /u6280/u80fd/u5143/u6570/u636e

**Created**: 2026-01-07
**Last Updated**: 2026-01-07
**Author**: Agent Skills for Context Engineering Contributors
**Version**: 1.0.0

## /u9650/u5236
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
