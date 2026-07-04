---
name: playground
description: "Playground — 交互式沙盒相关功能和最佳实践"
---

# 沙盒构建器

沙盒是一个自包含的 HTML 文件，一侧有交互式控件，另一侧有实时预览，底部有带复制按钮的提示输出。用户调整控件、直观探索，然后将生成的提示复制回 Claude。

## 何时使用此技能

当用户请求某个主题的交互式沙盒、浏览器或可视化工具时——尤其是当输入空间很大、涉及视觉或结构元素、难以用纯文本表达时。

## 如何使用此技能

1. **根据用户请求识别沙盒类型**
2. **从 `templates/` 加载匹配的模板**：
   - `templates/design-playground.md` — 视觉设计决策（组件、布局、间距、颜色、排版）
   - `templates/data-explorer.md` — 数据和查询构建（SQL、API、管道、正则表达式）
   - `templates/concept-map.md` — 学习和探索（概念图、知识盲区、范围映射）
   - `templates/document-critique.md` — 文档审查（含批准/拒绝/评论工作流的建议）
   - `templates/diff-review.md` — 代码审查（git diff、提交、PR 逐行评论）
   - `templates/code-map.md` — 代码库架构（组件关系、数据流、层级图）
3. **遵循模板**构建沙盒。如果主题不完全匹配任何模板，使用最接近的并调整。
4. **在浏览器中打开。** 写入 HTML 文件后，运行 `open <filename>.html` 在用户默认浏览器中启动。

## 核心要求（每个沙盒）

- **单个 HTML 文件。** 内联所有 CSS 和 JS。无外部依赖。
- **实时预览。** 每次控件更改时立即更新。无"应用"按钮。
- **提示输出。** 自然语言，而非值转储。仅提及非默认选择。包含足够的上下文，无需看到沙盒即可操作。实时更新。
- **复制按钮。** 剪贴板复制，带短暂的"已复制！"反馈。
- **合理的默认值 + 预设。** 首次加载时看起来不错。包含 3-5 个命名预设，将所有控件切换为连贯的组合。
- **深色主题。** UI 使用系统字体，代码/值使用等宽字体。极简装饰。

## 状态管理模式

保持单一状态对象。每个控件写入它，每次渲染读取它。

```javascript
const state = { /* 所有可配置的值 */ };

function updateAll() {
  renderPreview(); // 更新可视化
  updatePrompt();  // 重建提示文本
}
// 每个控件在更改时调用 updateAll()
```

## 提示输出模式

```javascript
function updatePrompt() {
  const parts = [];

  // 仅提及非默认值
  if (state.borderRadius !== DEFAULTS.borderRadius) {
    parts.push(`border-radius 为 ${state.borderRadius}px`);
  }

  // 配合数字使用定性语言
  if (state.shadowBlur > 16) parts.push('明显的阴影');
  else if (state.shadowBlur > 0) parts.push('微妙的阴影');

  prompt.textContent = `将卡片更新为使用 ${parts.join(', ')}。`;
}
```

## 常见错误

- 提示输出仅是值转储 → 应写成自然指令
- 一次性控件太多 → 按关注点分组，高级选项隐藏在可折叠部分
- 预览不会立即更新 → 每次控件更改必须触发立即重渲染
- 无默认值或预设 → 加载时为空或损坏
- 外部依赖 → 如果 CDN 宕机，沙盒无法使用
- 提示缺乏上下文 → 包含足够信息，使其无需沙盒即能操作
