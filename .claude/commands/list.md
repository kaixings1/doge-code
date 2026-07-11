---
description: 列出所有已配置的 hookify 规则
allowed-tools: ["Glob", "Read", "Skill"]
---

# 列出 Hookify 规则

**首先加载 hookify:writing-rules 技能**以了解规则格式。

显示项目中所有已配置的 hookify 规则。

## 步骤

1. 使用 Glob 工具查找所有 hookify 规则文件：
   ```
   pattern: ".claude/hookify.*.local.md"
   ```

2. 对于找到的每个文件：
   - 使用 Read 工具读取文件
   - 提取 frontmatter 字段：name、enabled、event、pattern
   - 提取消息预览（前 100 个字符）

3. 在表格中展示结果：

```
## 已配置的 Hookify 规则

| 名称 | 已启用 | 事件 | 模式 | 文件 |
|------|---------|-------|---------|------|
| warn-dangerous-rm | ✅ 是 | bash | rm\s+-rf | hookify.dangerous-rm.local.md |
| warn-console-log | ✅ 是 | file | console\.log\( | hookify.console-log.local.md |
| check-tests | ❌ 否 | stop | .* | hookify.require-tests.local.md |

**总计**：3 条规则（2 条已启用，1 条已禁用）
```

4. 对于每条规则，显示简短预览：
```
### warn-dangerous-rm
**事件**：bash
**模式**：`rm\s+-rf`
**消息**："⚠️ **检测到危险的 rm 命令！** 此命令可能删除..."

**状态**：✅ 活跃
**文件**：.claude/hookify.dangerous-rm.local.md
```

5. 添加有用的页脚：
```
---

修改规则：直接编辑 .local.md 文件
禁用规则：在 frontmatter 中设置 `enabled: false`
启用规则：在 frontmatter 中设置 `enabled: true`
删除规则：删除 .local.md 文件
创建规则：使用 `/hookify` 命令

**记住**：更改立即生效 - 无需重启
```

## 如果未找到规则

如果不存在 hookify 规则：

```
## 未配置 Hookify 规则

你尚未创建任何 hookify 规则。

开始使用：
1. 使用 `/hookify` 分析对话并创建规则
2. 或手动创建 `.claude/hookify.my-rule.local.md` 文件
3. 查看 `/hookify:help` 获取文档

示例：
```
/hookify 当我使用 console.log 时警告我
```

查看 `${CLAUDE_PLUGIN_ROOT}/examples/` 获取示例规则文件。
```
