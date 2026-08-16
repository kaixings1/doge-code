---
name: instinct-export
description: Export instincts from project/global scope to a file
command: /instinct-export
---

# 习惯（Instinct）导出命令（Instinct Export Command）

将习惯（Instincts）导出为可共享格式。适用于：
- 与团队成员共享
- 迁移至新机器
- 为项目规范（Conventions）做贡献

## 用法（Usage）

```
/instinct-export                           # 导出所有个人习惯
/instinct-export --domain testing          # 仅导出测试相关的习惯
/instinct-export --min-confidence 0.7      # 仅导出高置信度的习惯
/instinct-export --output team-instincts.yaml
/instinct-export --scope project --output project-instincts.yaml
```

## 执行逻辑（What to Do）

1. 检测当前项目上下文（Context）
2. 按选定范围（Scope）加载习惯：
   - `project`：仅限当前项目
   - `global`：仅限全局
   - `all`：项目 + 全局合并（默认）
3. 应用过滤器（`--domain`、`--min-confidence`）
4. 将 YAML 格式的导出结果写入文件（如果未提供输出路径，则输出至 `stdout`）

## 输出格式（Output Format）

创建一个 YAML 文件：

```yaml
# Instincts Export
# Generated: 2025-01-22
# Source: personal
# Count: 12 instincts

---
id: prefer-functional-style
trigger: "when writing new functions"
confidence: 0.8
domain: code-style
source: session-observation
scope: project
project_id: a1b2c3d4e5f6
project_name: my-app
---

# Prefer Functional Style

## Action
Use functional patterns over classes.
```

## 参数（Flags）

- `--domain <name>`：仅导出指定领域（Domain）
- `--min-confidence <n>`：最低置信度阈值
- `--output <file>`：输出文件路径（省略时打印至 `stdout`）
- `--scope <project|global|all>`：导出范围（Scope）（默认：`all`）
