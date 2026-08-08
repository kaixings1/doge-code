# OpenCode 集成

所有 182 个代理已合并为 OpenCode 兼容格式。

## 安装

```bash
# 从项目根目录运行
node scripts/convert-opencode.mjs
```

## 输出

转换后的代理文件位于：

```
.claude/agents/integrations/opencode/agents/
```

每个代理文件包含简化的 YAML frontmatter（`name` + `description`）和完整的 Markdown prompt 内容。

## 重新生成

```bash
node scripts/convert-opencode.mjs
```
