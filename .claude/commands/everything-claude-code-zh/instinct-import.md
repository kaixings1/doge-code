---
name: instinct-import
description: 从文件或 URL 导入直觉（Instincts）到项目/全局作用域
command: true
---

# 直觉导入命令（Instinct Import Command）

## 实现 (Implementation)

使用插件根路径运行直觉（Instinct）命令行工具（CLI）：

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/skills/continuous-learning-v2/scripts/instinct-cli.py" import <file-or-url> [--dry-run] [--force] [--min-confidence 0.7] [--scope project|global]
```

或者如果未设置 `CLAUDE_PLUGIN_ROOT`（手动安装）：

```bash
python3 ~/.claude/skills/continuous-learning-v2/scripts/instinct-cli.py import <file-or-url>
```

从本地文件路径或 HTTP(S) URL 导入直觉。

## 用法 (Usage)

```
/instinct-import team-instincts.yaml
/instinct-import https://github.com/org/repo/instincts.yaml
/instinct-import team-instincts.yaml --dry-run
/instinct-import team-instincts.yaml --scope global --force
```

## 执行流程 (What to Do)

1. 获取直觉文件（本地路径或 URL）
2. 解析并验证格式
3. 检查现有直觉是否重复
4. 合并或添加新直觉
5. 保存到继承的直觉目录：
   - 项目作用域（Project scope）：`~/.claude/homunculus/projects/<project-id>/instincts/inherited/`
   - 全局作用域（Global scope）：`~/.claude/homunculus/instincts/inherited/`

## 导入过程 (Import Process)

```
📥 正在导入直觉，来源：team-instincts.yaml
================================================

发现 12 条待导入的直觉。

正在分析冲突...

## 新直觉 (New Instincts) (8)
这些将被添加：
  ✓ use-zod-validation (置信度: 0.7)
  ✓ prefer-named-exports (置信度: 0.65)
  ✓ test-async-functions (置信度: 0.8)
  ...

## 重复直觉 (Duplicate Instincts) (3)
已存在类似的直觉：
  ⚠️ prefer-functional-style
     本地: 0.8 置信度, 12 条观测记录
     导入: 0.7 置信度
     → 保留本地 (置信度更高)

  ⚠️ test-first-workflow
     本地: 0.75 置信度
     导入: 0.9 置信度
     → 更新为导入版本 (置信度更高)

导入 8 条新直觉，更新 1 条？
```

## 合并行为 (Merge Behavior)

导入具有现有 ID 的直觉时：
- 较高置信度的导入项将成为更新候选。
- 相同或较低置信度的导入项将被跳过。
- 除非使用 `--force`，否则需用户确认。

## 来源追踪 (Source Tracking)

导入的直觉会被标记为：
```yaml
source: inherited
scope: project
imported_from: "team-instincts.yaml"
project_id: "a1b2c3d4e5f6"
project_name: "my-project"
```

## 参数列表 (Flags)

- `--dry-run`: 预览而不实际导入。
- `--force`: 跳过确认提示。
- `--min-confidence <n>`: 仅导入高于置信度阈值的直觉。
- `--scope <project|global>`: 选择目标作用域（默认为 `project`）。

## 输出结果 (Output)

导入完成后：
```
✅ 导入完成！

添加：8 条直觉
更新：1 条直觉
跳过：3 条直觉 (已存在相同或更高置信度的直觉)

新直觉已保存至：~/.claude/homunculus/instincts/inherited/

运行 /instinct-status 查看所有直觉。
```
