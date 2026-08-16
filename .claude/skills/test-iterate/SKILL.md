---
name: test-iterate
description: 执行测试/命令，分析结果，自动迭代直到达标。用于验证代码改动、修复失败测试、确认功能正常。
argument-hint: "<测试命令> [--max-iterations <n>] [--expected <pattern>]"
level: 3
---

# Test-Iterate Skill

[TEST-ITERATE ACTIVATED - AUTONOMOUS EXECUTE → ANALYZE → ITERATE]

## Purpose

执行测试或命令，分析输出结果，判断是否与预期相符，不符则自动修复并重新执行，循环直到达标。

**核心循环**：执行 → 分析 → 决策（继续/停止）

## When to Use

- 用户说"测试一下"、"跑一下看看"、"验证是否正常"
- 用户要求"拿去实际测试"、"执行结果拿来"
- 修复 bug 后需要验证修复是否生效
- 用户说"先执行，看结果再决定"
- 任何需要"执行→看结果→决定下一步"的场景

## When NOT to Use

- 只是需要解释代码或概念 → 直接回答
- 用户明确要求只执行一次，不做迭代 → 直接执行命令
- 需要人工介入的决策（如破坏性操作）→ 先询问

## Workflow

### 1. 解析参数

从用户输入中提取：
- **测试命令**：要执行的命令（如 `npx vitest run`、`npm test`、`bun run build`）
- **--max-iterations**：最大迭代次数，默认 5
- **--expected**：预期结果模式（正则或关键词），默认 "passed" 或 "通过"
- **--fail-pattern**：失败模式，用于判断是否需要停止（如相同错误出现 3 次）

### 2. 执行命令

直接执行用户提供的命令，使用 Bash 工具：
- 超时时间根据命令类型设置（测试 120s，构建 60s）
- 捕获完整 stdout/stderr
- 返回退出码

### 3. 分析结果

对执行结果进行分析：
- **PASS**：输出包含预期关键词，无错误
- **FAIL**：输出包含失败信息
- **UNKNOWN**：无法判断（输出为空、格式异常）

分析维度：
- 测试通过/失败数量
- 构建成功/失败
- 错误类型（语法错误、类型错误、逻辑错误）
- 是否有新错误引入

### 4. 决策

| 结果 | 行动 |
|------|------|
| **PASS** | 报告成功，停止迭代 |
| **FAIL - 可自动修复** | 分析错误，应用修复，重新执行 |
| **FAIL - 需人工决策** | 报告问题，询问用户 |
| **UNKNOWN** | 报告输出，询问用户 |

**自动修复条件**：
- 已知的简单错误（导入路径、类型断言、语法错误）
- 有明确的修复方案
- 修复不会影响其他功能

**停止条件**：
- 达到最大迭代次数
- 相同错误连续出现 3 次（说明是根本性问题）
- 用户要求停止

### 5. 迭代或停止

- 如果继续：回到步骤 2
- 如果停止：输出最终报告

## Output Format

每次迭代输出：

```
[TEST-ITERATE Cycle 1/5] 执行: npx vitest run
[TEST-ITERATE Cycle 1/5] 结果: PASS - 27 tests passed
[TEST-ITERATE COMPLETE] 达标，停止迭代
```

或

```
[TEST-ITERATE Cycle 1/5] 执行: npx vitest run
[TEST-ITERATE Cycle 1/5] 结果: FAIL - 3 tests failed
[TEST-ITERATE Cycle 1/5] 错误: src/foo.test.ts - missing mock
[TEST-ITERATE Cycle 1/5] 修复: 添加 mock
[TEST-ITERATE Cycle 2/5] 执行: npx vitest run
[TEST-ITERATE Cycle 2/5] 结果: PASS - 27 tests passed
[TEST-ITERATE COMPLETE] 达标，停止迭代
```

## Examples

<Good>
User: "test-iterate npx vitest run src/__tests__/commands/task.test.ts"
→ 执行测试，分析结果，如有失败自动修复，直到通过或达到最大迭代次数
</Good>

<Good>
User: "拿去实际测试：npm run build"
→ 执行构建，分析输出，如有错误自动修复
</Good>

<Good>
User: "test-iterate npx vitest run --max-iterations 3 --expected 'all tests passed'"
→ 最多迭代 3 次，预期输出包含 "all tests passed"
</Good>

<Bad>
User: "test-iterate 帮我重构 auth 模块"
→ 这不是测试命令，应该用其他技能
</Bad>

<Bad>
User: "test-iterate 删除所有文件"
→ 这是破坏性操作，应该先询问
</Bad>

## Rules

1. **实际执行** - 必须真实运行命令，拿到真实输出
2. **真实分析** - 基于实际输出分析，不猜测
3. **最小修复** - 只修复导致测试失败的问题，不做额外重构
4. **停止条件** - 达到预期或达到最大迭代次数必须停止
5. **透明输出** - 每次迭代清楚显示执行命令、结果、决策

## Integration

可与其他技能组合：
- `/ultraqa` - 更完整的 QA 循环（包含架构验证）
- `/ralph` - 单一任务执行循环
- `/fix` - 专门修复错误
