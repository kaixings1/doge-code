# Repository: D:/doge-code/src/commands/repo-pack/__tests__/fixtures

> Packed by repo-pack | 2026-08-28T06:22:24.745Z

## Directory Structure

Directory structure:

└── custom-output.md
└── README.md
└── repomix-output.md

---

## Files

### custom-output.md

```
# Repository: D:/doge-code/src/commands/repo-pack/__tests__/fixtures

> Packed by repo-pack | 2026-08-28T06:22:24.736Z

## Files

### README.md

```
# Test Project
This is a test.

```

### repomix-output.md

```
# Repository: D:/doge-code/src/commands/repo-pack/__tests__/fixtures

> Packed by repo-pack | 2026-08-28T06:22:24.732Z

## Git Log

```
b977563af chore: 减少无效token消耗 1. 删除 engine/smolagents/prompts/ 下 3 个无引用的 YAML 模板文件（43KB dead code，代码中无任何 import/reference） 2. 精简 autoCompactor.ts 的摘要 prompt：从 ~700 字压到 ~150 字，保留核心信息（技术细节、文件路径、未完成工作） 3. 精简 WebSearchTool/prompt.ts：日期提示从 3 处合并为 1 处，消除重复说明 测试：354 passed, 1778 passed. Co-Authored-By: kaixings <30445355@qq.com>
09406d8d6 chore: 添加 .temp_large_files/ 到 .gitignore
6698d945b chore: 清理冗余的 vendored 二进制文件 移除 src/vendor/ 和 src/utils/vendor/ 下无引用的二进制文件 (seccomp 策略 + audio-capture 各平台 .node 模块)，以及孤立 文件 src/query--org.ts--。代码中无任何引用，测试全部通过。 共移除 17 个文件，释放约 15.6 MB 仓库空间。 Co-Authored-By: kaixings <30445355@qq.com>
af699dfb5 fix: 修复 REPL.tsx 中占位符永不消失导致消息重复显示 根因：commit 61418e8b 在 setMessages 包装器中，当用户消息落地时错误地 将 userInputBaselineRef 更新为 next.length（等于 displayedMessages.length）， 导致占位符条件 displayedMessages.length <= baseline 永远为 true，占位文本 持续渲染并与真实消息重叠显示。 修复：移除 isHumanTurn 分支中的 userInputBaselineRef.current = next.length， 保留 else 分支（非用户消息异步落地时更新基线）。这样用户消息落地后基线 保持不变，占位符条件变为 false，占位文本正确消失。 Co-Authored-By: kaixings <30445355@qq.com>
1e875f6ef fix: 恢复 REPL.tsx usesSyncMessages 条件判断 将硬编码的 usesSyncMessages = true 恢复为 showStreamingText || !isLoading， 修复输入提交后消息重复显示的问题。 Co-Authored-By: kaixings <30445355@qq.com>
```

---

## Files

### README.md

```
# Test Project
This is a test.

```

### repomix-output.md

```
# Repository: D:/doge-code/src/commands/repo-pack/__tests__/fixtures

> Packed by repo-pack | 2026-08-28T06:22:24.648Z

## Git Diff

```
src/commands.ts             | 164 +++++++++++++++++++-------------------------
 src/engine/autoCompactor.ts |   2 +-
 2 files changed, 73 insertions(+), 93 deletions(-)
```

---

## Files

### README.md

```
# Test Project
This is a test.

```

### repomix-output.md

```
# Repository: D:/doge-code/src/commands/repo-pack/__tests__/fixtures

> Packed by repo-pack | 2026-08-28T06:22:24.546Z

## Files

### README.md

```
# Test Project
This is a test.

```

... (truncated at token budget 10)
---
Total files: 2 | Estimated tokens: 9
```

---
Total files: 2 | Estimated tokens: 84
```

---
Total files: 2 | Estimated tokens: 214
```

---
Total files: 2 | Estimated tokens: 642
```

### README.md

```
# Test Project
This is a test.

```

### repomix-output.md

```
# Repository: D:/doge-code/src/commands/repo-pack/__tests__/fixtures

> Packed by repo-pack | 2026-08-28T06:22:24.732Z

## Git Log

```
b977563af chore: 减少无效token消耗 1. 删除 engine/smolagents/prompts/ 下 3 个无引用的 YAML 模板文件（43KB dead code，代码中无任何 import/reference） 2. 精简 autoCompactor.ts 的摘要 prompt：从 ~700 字压到 ~150 字，保留核心信息（技术细节、文件路径、未完成工作） 3. 精简 WebSearchTool/prompt.ts：日期提示从 3 处合并为 1 处，消除重复说明 测试：354 passed, 1778 passed. Co-Authored-By: kaixings <30445355@qq.com>
09406d8d6 chore: 添加 .temp_large_files/ 到 .gitignore
6698d945b chore: 清理冗余的 vendored 二进制文件 移除 src/vendor/ 和 src/utils/vendor/ 下无引用的二进制文件 (seccomp 策略 + audio-capture 各平台 .node 模块)，以及孤立 文件 src/query--org.ts--。代码中无任何引用，测试全部通过。 共移除 17 个文件，释放约 15.6 MB 仓库空间。 Co-Authored-By: kaixings <30445355@qq.com>
af699dfb5 fix: 修复 REPL.tsx 中占位符永不消失导致消息重复显示 根因：commit 61418e8b 在 setMessages 包装器中，当用户消息落地时错误地 将 userInputBaselineRef 更新为 next.length（等于 displayedMessages.length）， 导致占位符条件 displayedMessages.length <= baseline 永远为 true，占位文本 持续渲染并与真实消息重叠显示。 修复：移除 isHumanTurn 分支中的 userInputBaselineRef.current = next.length， 保留 else 分支（非用户消息异步落地时更新基线）。这样用户消息落地后基线 保持不变，占位符条件变为 false，占位文本正确消失。 Co-Authored-By: kaixings <30445355@qq.com>
1e875f6ef fix: 恢复 REPL.tsx usesSyncMessages 条件判断 将硬编码的 usesSyncMessages = true 恢复为 showStreamingText || !isLoading， 修复输入提交后消息重复显示的问题。 Co-Authored-By: kaixings <30445355@qq.com>
```

---

## Files

### README.md

```
# Test Project
This is a test.

```

### repomix-output.md

```
# Repository: D:/doge-code/src/commands/repo-pack/__tests__/fixtures

> Packed by repo-pack | 2026-08-28T06:22:24.648Z

## Git Diff

```
src/commands.ts             | 164 +++++++++++++++++++-------------------------
 src/engine/autoCompactor.ts |   2 +-
 2 files changed, 73 insertions(+), 93 deletions(-)
```

---

## Files

### README.md

```
# Test Project
This is a test.

```

### repomix-output.md

```
# Repository: D:/doge-code/src/commands/repo-pack/__tests__/fixtures

> Packed by repo-pack | 2026-08-28T06:22:24.546Z

## Files

### README.md

```
# Test Project
This is a test.

```

... (truncated at token budget 10)
---
Total files: 2 | Estimated tokens: 9
```

---
Total files: 2 | Estimated tokens: 84
```

---
Total files: 2 | Estimated tokens: 214
```

---
Total files: 3 | Estimated tokens: 1350