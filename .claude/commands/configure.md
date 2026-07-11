---
description: 交互式启禁用 hookify 规则
allowed-tools: ["Glob", "Read", "Edit", "AskUserQuestion", "Skill"]
---

# 配置 Hookify 规则

**首先加载 hookify:writing-rules 技能**以了解规则格式。

使用交互式界面启用或禁用现有的 hookify 规则。

## 步骤

### 1. 查找现有规则

使用 Glob 工具查找所有 hookify 规则文件：
```
pattern: ".claude/hookify.*.local.md"
```

如果未找到规则，告知用户：
```
尚未配置 hookify 规则。使用 `/hookify` 创建你的第一条规则。
```

### 2. 读取当前状态

对于每个规则文件：
- 读取文件内容
- 从 frontmatter 中提取 `name` 和 `enabled` 字段
- 构建带当前状态的规则列表

### 3. 询问用户要切换哪些规则

使用 AskUserQuestion 让用户选择规则：

```json
{
  "questions": [
    {
      "question": "您想要启用或禁用哪些规则？",
      "header": "配置",
      "multiSelect": true,
      "options": [
        {
          "label": "warn-dangerous-rm（当前已启用）",
          "description": "警告 rm -rf 命令"
        },
        {
          "label": "warn-console-log（当前已禁用）",
          "description": "警告代码中的 console.log"
        },
        {
          "label": "require-tests（当前已启用）",
          "description": "在停止前要求测试"
        }
      ]
    }
  ]
}
```

**选项格式：**
- Label：`{规则名称}（当前{已启用|已禁用}）`
- Description：来自规则 message 或 pattern 的简要描述

### 4. 解析用户选择

对于每个选中的规则：
- 从标签确定当前状态（已启用/已禁用）
- 切换状态：已启用 → 已禁用，已禁用 → 已启用

### 5. 更新规则文件

对于每个要切换的规则：
- 使用 Read 工具读取当前内容
- 使用 Edit 工具将 `enabled: true` 改为 `enabled: false`（或相反）
- 处理带引号和不带引号两种情况

**启用编辑模式：**
```
old_string: "enabled: false"
new_string: "enabled: true"
```

**禁用编辑模式：**
```
old_string: "enabled: true"
new_string: "enabled: false"
```

### 6. 确认更改

向用户展示更改内容：

```
## Hookify 规则已更新

**已启用：**
- warn-console-log

**已禁用：**
- warn-dangerous-rm

**未更改：**
- require-tests

更改立即生效 - 无需重启
```

## 重要说明

- 更改在下一次工具使用时立即生效
- 你也可以手动编辑 .claude/hookify.*.local.md 文件
- 要永久移除规则，删除其 .local.md 文件
- 使用 `/hookify:list` 查看所有已配置的规则

## 边界情况

**没有可配置的规则：**
- 显示使用 `/hookify` 先创建规则的消息

**用户未选择任何规则：**
- 告知未做任何更改

**文件读/写错误：**
- 告知用户具体错误信息
- 建议手动编辑作为后备方案
