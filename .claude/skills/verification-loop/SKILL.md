---
name: verification-loop
description: 验证循环工作流
---

# 验证循环技能

用于 Claude Code 会话的全面验证系统。

## 使用时机

调用此技能：
- 完成功能或重大代码变更后
- 创建 PR 之前
- 需要确保质量关卡通过时
- 重构之后

## 验证阶段

### 阶段 1：构建验证
```bash
# 检查项目是否能构建
npm run build 2>&1 | tail -20
# 或者
pnpm build 2>&1 | tail -20
```

如果构建失败，停止并在继续之前修复。

### 阶段 2：类型检查
```bash
# TypeScript 项目
npx tsc --noEmit 2>&1 | head -30

# Python 项目
pyright . 2>&1 | head -30
```

报告所有类型错误。在继续之前修复关键错误。

### 阶段 3：Lint 检查
```bash
# JavaScript/TypeScript
npm run lint 2>&1 | head -30

# Python
ruff check . 2>&1 | head -30
```

### 阶段 4：测试套件
```bash
# 运行测试并带覆盖率
npm run test -- --coverage 2>&1 | tail -50

# 检查覆盖率阈值
# 目标：最低 80%
```

报告：
- 总测试数：X
- 通过：X
- 失败：X
- 覆盖率：X%

### 阶段 5：安全扫描
```bash
# 检查密钥泄露
grep -rn "sk-" --include="*.ts" --include="*.js" . 2>/dev/null | head -10
grep -rn "api_key" --include="*.ts" --include="*.js" . 2>/dev/null | head -10

# 检查 console.log
grep -rn "console.log" --include="*.ts" --include="*.tsx" src/ 2>/dev/null | head -10
```

### 阶段 6：差异审查
```bash
# 显示变更内容
git diff --stat
git diff HEAD~1 --name-only
```

审查每个变更文件：
- 非预期的变更
- 缺少错误处理
- 潜在的边界情况

## 输出格式

运行所有阶段后，生成验证报告：

```
验证报告
==================

构建：     [通过/失败]
类型：     [通过/失败] (X 个错误)
Lint：     [通过/失败] (X 个警告)
测试：     [通过/失败] (X/Y 通过, Z% 覆盖率)
安全：     [通过/失败] (X 个问题)
差异：     [X 个文件变更]

总体：     [就绪/未就绪] 用于 PR

待修复问题：
1. ...
2. ...
```

## 连续模式

对于长时间会话，每 15 分钟或在重大变更后运行验证：

```markdown
设置心理检查点：
- 完成每个函数后
- 完成组件后
- 移动到下一个任务前

运行：/verify
```

## 与 Hooks 集成

此技能补充 PostToolUse hooks，但提供更深入的验证。
Hooks 即时捕获问题；此技能提供全面的审查。
