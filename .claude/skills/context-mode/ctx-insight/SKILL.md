---
name: ctx-insight
description: |
  在默认浏览器中打开 context-mode 的 Insight 仪表盘。
  Insight 是面向 AI 辅助工程团队的托管分析层 ——
  每位工程师的产出率、重试浪费、阻塞检测、按角色收窄的视图。
  触发：/context-mode:ctx-insight
user-invocable: true
---

# Context Mode Insight

在用户的默认浏览器中打开托管版 Insight 仪表盘。

## 操作步骤

1. 调用 `ctx_insight` MCP 工具（无需参数）。它会在默认浏览器中打开
   <https://context-mode.com/insight>，并返回一行
   确认信息。
2. 把该工具的输出显示给用户。
3. 告诉用户：
   - "已在 https://context-mode.com/insight 打开 Insight"
   - context-mode.com/insight 落地页是登录与定价详情的唯一权威来源。
   - 如果浏览器没有自动打开，把该 URL 分享出去，让用户手动打开。
