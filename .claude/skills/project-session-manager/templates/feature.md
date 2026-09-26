# 功能开发上下文

正在开发功能：**{{FEATURE_NAME}}**

## 详情

- **分支**: `{{BRANCH_NAME}}`
- **基分支**: `{{BASE_BRANCH}}`
- **项目**: {{PROJECT}}

## 功能范围

{{FEATURE_DESCRIPTION}}

## 开发流程

1. **规划**
   - 明确需求
   - 拆分子任务
   - 识别依赖关系

2. **实现**
   - 遵循项目规范
   - 编写简洁、可测试的代码
   - 逐步提交

3. **测试**
   - 新代码的单元测试
   - 需要时的集成测试
   - 手动测试

4. **文档**
   - 更新相关文档
   - 必要时添加代码注释
   - 更新 CHANGELOG

## 命令

```bash
# 运行测试
npm test  # 或合适的测试命令

# 检查构建
npm run build  # 或合适的构建命令

# 准备就绪后创建 PR
gh pr create --title "Feature: {{FEATURE_NAME}}" --body "## Summary\n\n<description>\n\n## Changes\n\n- <change 1>\n- <change 2>"
```

## 功能清单

- [ ] 需求已明确
- [ ] 实现已完成
- [ ] 测试已编写并通过
- [ ] 文档已更新
- [ ] 准备提交 PR
