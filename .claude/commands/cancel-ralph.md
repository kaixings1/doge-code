---
description: "取消当前活跃的 Ralph Loop"
allowed-tools: ["Bash(test -f .claude/ralph-loop.local.md:*)", "Bash(rm .claude/ralph-loop.local.md)", "Read(.claude/ralph-loop.local.md)"]
hide-from-slash-command-tool: "true"
---

# 取消 Ralph

要取消 Ralph 循环：

1. 使用 Bash 检查 `.claude/ralph-loop.local.md` 是否存在：`test -f .claude/ralph-loop.local.md && echo "EXISTS" || echo "NOT_FOUND"`

2. **如果未找到**：提示"未找到活跃的 Ralph 循环。"

3. **如果存在**：
   - 读取 `.claude/ralph-loop.local.md` 从 `iteration:` 字段获取当前迭代编号
   - 使用 Bash 删除文件：`rm .claude/ralph-loop.local.md`
   - 报告："已取消 Ralph 循环（迭代次数为 N）"，其中 N 为迭代值
