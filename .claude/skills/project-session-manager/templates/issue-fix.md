# 问题修复上下文

正在修复 Issue #{{ISSUE_NUMBER}}：**{{ISSUE_TITLE}}**

## 问题详情

- **URL**: {{ISSUE_URL}}
- **标签**: {{ISSUE_LABELS}}
- **分支**: `{{BRANCH_NAME}}`

## 描述

{{ISSUE_BODY}}

## 修复流程

1. **理解问题**
   - 如适用，复现问题
   - 识别根本原因
   - 考虑边界情况

2. **规划修复**
   - 最小化变更修复问题
   - 不引入回归
   - 考虑向后兼容

3. **实现**
   - 编写修复
   - 添加/更新测试
   - 必要时更新文档

4. **验证**
   - 运行现有测试
   - 测试特定修复
   - 检查回归

## 命令

```bash
# 运行测试
npm test  # 或合适的测试命令

# 检查构建
npm run build  # 或合适的构建命令

# 完成后创建 PR
gh pr create --title "Fix #{{ISSUE_NUMBER}}: <description>" --body "Fixes #{{ISSUE_NUMBER}}"
```

## 修复清单

- [ ] 根本原因已确认
- [ ] 修复已实现
- [ ] 测试已添加/更新
- [ ] 所有测试通过
- [ ] 未引入回归
- [ ] 准备提交 PR
