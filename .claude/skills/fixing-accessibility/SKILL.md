---
name: fixing-accessibility
description: "Fixing Accessibility — Fixing Accessibility 相关功能和最佳实践"
risk: unknown
source: community
---

# 修复可访问性问题

修复可访问性问题。

## 使用方法

- `/fixing-accessibility`
  将这些约束应用于此对话中的任何UI工作。

- `/fixing-accessibility <文件>`
  根据以下所有规则审查文件并报告：
  - 违规（引用确切的代码行或片段）
  - 为什么重要（简短的一句话）
  - 具体修复（代码级建议）

不要重写UI的大部分内容。优先考虑最小化、有针对性的修复。

## 使用场景
在以下情况下参考这些指南：
- 添加或更改按钮、链接、输入框、菜单、对话框、选项卡、下拉菜单
- 构建表单、验证、错误状态、帮助文本
- 实现键盘快捷键或自定义交互
- 处理焦点状态、焦点捕获或模态行为
- 渲染纯图标控件
- 添加仅悬停交互或隐藏内容

## 按优先级的规则分类

| 优先级 | 类别 | 影响 |
|----------|----------|--------|
| 1 | 可访问名称 | 关键 |
| 2 | 键盘访问 | 关键 |
| 3 | 焦点和对话框 | 关键 |
| 4 | 语义 | 高 |
| 5 | 表单和错误 | 高 |
| 6 | 通知 | 中高 |
| 7 | 对比度和状态 | 中 |
| 8 | 媒体和动效 | 低中 |
| 9 | 工具边界 | 关键 |

## 快速参考

| 操作 | 方法 |
|---|---|
| 发现工具 | 调用 `RUBE_SEARCH_TOOLS` |
| 检查连接 | 调用 `RUBE_MANAGE_CONNECTIONS` |
| 执行工具 | 调用 `RUBE_MULTI_EXECUTE_TOOL` |
| 处理分页 | 检查响应中的 `cursor` 字段 |
| 错误处理 | 验证连接状态和schema合规性 |

### 1. 可访问名称（关键）

- 每个可交互控件必须有一个可访问名称
- 纯图标按钮必须包含 aria-label 或 aria-labelledby
- 每个输入框、选择框和文本区域必须有标签
- 链接必须有有意义的文本（不要用”点击这里”）
- 装饰性图标必须是 aria-hidden

### 2. keyboard access (critical)

- do not use div or span as buttons without full keyboard support
- all interactive elements must be reachable by Tab
- focus must be visible for keyboard users
- do not use tabindex greater than 0
- Escape must close dialogs or overlays when applicable

### 3. focus and dialogs (critical)

- modals must trap focus while open
- restore focus to the trigger on close
- set initial focus inside dialogs
- opening a dialog should not scroll the page unexpectedly

### 4. semantics (high)

- prefer native elements (button, a, input) over role-based hacks
- if a role is used, required aria attributes must be present
- lists must use ul or ol with li
- do not skip heading levels
- tables must use th for headers when applicable

### 5. forms and errors (high)

- errors must be linked to fields using aria-describedby
- required fields must be announced
- invalid fields must set aria-invalid
- helper text must be associated with inputs
- disabled submit actions must explain why

### 6. announcements (medium-high)

- critical form errors should use aria-live
- loading states should use aria-busy or status text
- toasts must not be the only way to convey critical information
- expandable controls must use aria-expanded and aria-controls

### 7. contrast and states (medium)

- ensure sufficient contrast for text and icons
- hover-only interactions must have keyboard equivalents
- disabled states must not rely on color alone
- do not remove focus outlines without a visible replacement

### 8. media and motion (low-medium)

- images must have correct alt text (meaningful or empty)
- videos with speech should provide captions when relevant
- respect prefers-reduced-motion for non-essential motion
- avoid autoplaying media with sound

### 9. tool boundaries (critical)

- prefer minimal changes, do not refactor unrelated code
- do not add aria when native semantics already solve the problem
- do not migrate UI libraries unless requested

## common fixes

```html
<!-- icon-only button: add aria-label -->
<!-- before --> <button><svg>...</svg></button>
<!-- after -->  <button aria-label="Close"><svg aria-hidden="true">...</svg></button>

<!-- div as button: use native element -->
<!-- before --> <div onclick="save()">Save</div>
<!-- after -->  <button onclick="save()">Save</button>

<!-- form error: link with aria-describedby -->
<!-- before --> <input id="email" /> <span>Invalid email</span>
<!-- after -->  <input id="email" aria-describedby="email-err" aria-invalid="true" /> <span id="email-err">Invalid email</span>
```

## review guidance

- fix critical issues first (names, keyboard, focus, tool boundaries)
- prefer native HTML before adding aria
- quote the exact snippet, state the failure, propose a small fix
- for complex widgets (menu, dialog, combobox), prefer established accessible primitives over custom behavior

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
