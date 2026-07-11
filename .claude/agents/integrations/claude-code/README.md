# Claude Code 集成

Agency 专为 Claude Code 构建。无需转换——Agent 使用现有的 `.md` + YAML 前置元数据格式原生工作。

## 安装

```bash
# 将所有 Agent 复制到您的 Claude Code Agent 目录
./scripts/install.sh --tool claude-code

# 或手动复制某个类别
cp engineering/*.md ~/.claude/agents/
```

## 激活 Agent

在任何 Claude Code 会话中，通过名称引用 Agent：

```
激活前端开发 Agent，帮我构建一个 React 组件。
```

```
使用 Reality Checker Agent 验证此功能是否已准备好投入生产。
```

## Agent 目录

Agent 按部门组织。请参阅[主 README](../../README.md) 获取完整当前列表。
