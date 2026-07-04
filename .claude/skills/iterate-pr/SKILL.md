---
name: iterate-pr
description: "Iterate Pr — Iterate Pr 相关功能和最佳实践"
risk: critical
source: community
---
# 迭代 PR 直到 CI 通过
持续迭代当前分支，直到所有 CI 检查通过并解决了审查反馈。
**需要**: GitHub CLI (gh) 已认证。
**重要**: 所有脚本必须从仓库根目录运行。
## 捆绑脚本
### scripts/fetch_pr_checks.py
获取 CI 检查状态并从日志中提取失败片段。
### scripts/fetch_pr_feedback.py
获取 PR 审查反馈，按 LOGAF 等级分类。
## 工作流
### 1. 识别 PR
### 2. 收集审查反馈
### 3. 按 LOGAF 优先级处理反馈
### 4. 检查 CI 状态
### 5. 修复 CI 失败
### 6. 本地验证，然后提交并推送
### 7. 监控 CI 和处理反馈
### 8. 重复
## 退出条件
**成功**: 所有检查通过，无未处理的高/中优先级反馈。
**请求帮助**: 相同失败 2 次后，反馈需要澄清，基础设施问题。
**停止**: 没有 PR 存在，分支需要变基。
## 回退
如果脚本失败，直接用 gh CLI。
## 何时使用
## 限制
