---
description: 一个演示命令 frontmatter 选项的斜杠命令示例（旧格式）
argument-hint: <required-arg> [optional-arg]
allowed-tools: [Read, Glob, Grep, Bash]
---

# 示例命令（旧版 `commands/` 格式）

> **注意：** 这演示了旧版 `commands/*.md` 的文件布局。对于新插件，建议使用 `skills/<name>/SKILL.md` 目录格式（请参见此插件中的 `skills/example-command/SKILL.md`）。两者的加载方式完全相同——唯一的区别是文件布局。

此命令演示了斜杠命令结构和 frontmatter 选项。

## 参数

用户使用以下参数调用此命令：$ARGUMENTS

## 说明

当此命令被调用时：

1. 解析用户提供的参数
2. 使用允许的工具执行请求的操作
3. 向用户报告结果

## Frontmatter 选项参考

命令支持以下 frontmatter 字段：

- **description**：在 /help 中显示的简短描述
- **argument-hint**：向用户显示的命令参数提示
- **allowed-tools**：为此命令预先批准的工具（减少权限提示）
- **model**：覆盖模型（例如 "haiku", "sonnet", "opus"）

## 示例用法

```
/example-command my-argument
/example-command arg1 arg2
```
