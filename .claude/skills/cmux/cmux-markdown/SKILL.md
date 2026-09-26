---
name: cmux-markdown
description: 在带实时重载的格式化查看面板中打开 markdown 文件。当你需要在终端旁以富渲染方式（标题、代码块、表格、列表）展示计划、文档或笔记时使用。
---

# 配合 cmux 使用的 Markdown 查看器

写一个 `.md` 文件，在面板中打开它，此后只要磁盘上的文件发生变化，面板就会重新渲染。可用于在终端旁展示代理计划与任务列表、工作过程中的文档与变更日志，以及由另一个进程逐步更新的笔记。

```bash
cmux markdown open plan.md                              # 在当前终端旁分屏打开
cmux markdown open /path/to/PLAN.md
cmux markdown open design.md --workspace workspace:2    # 也可用 --surface、--window
```

相对路径基于调用方的 cwd 解析，`~` 会被展开；解析后的绝对路径会在输出中返回。

## 代理用法

先把完整的计划文件写好，再打开它，这样面板就绝不会显示一个只写了一半的文件。之后可以随意覆盖或追加：每次写入都会触发重新渲染，并且能正确处理原子替换（编辑器保存、`sed -i`、VS Code）。

要在某个项目中指示编码代理，可在其 `AGENTS.md` 中加入：

```markdown
## 计划展示

创建计划或任务列表时，把它写入一个 `.md` 文件并在 cmux 中打开：

    cmux markdown open plan.md

该面板会以富格式渲染 markdown，并在文件变化时自动更新。
```

## 渲染

标题 h1-h6（h1/h2 带分隔线）、等宽字体的围栏代码块、带高亮背景的行内代码、行色交替的表格、嵌套的有序与无序列表、带左边框的引用块、粗体/斜体/删除线、可点击链接、水平分隔线以及行内图片。亮色与暗色模式均支持。

## 深入参考

| 参考 | 何时使用 |
|-----------|-------------|
| [references/commands.md](references/commands.md) | 完整命令语法、选项、输出结构、面板行为 |
| [references/live-reload.md](references/live-reload.md) | 文件监听、原子写入、文件不可用状态、性能 |
