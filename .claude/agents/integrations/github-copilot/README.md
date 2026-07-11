# GitHub Copilot 集成

Agency 开箱即用地支持 GitHub Copilot。无需转换——Agent 使用现有的 `.md` + YAML 前置元数据格式。

## 安装

```bash
# 将所有 Agent 复制到您的 GitHub Copilot Agent 目录
./scripts/install.sh --tool copilot

# 或手动复制某个类别
cp engineering/*.md ~/.github/agents/
cp engineering/*.md ~/.copilot/agents/
```

## 激活 Agent

在任何 GitHub Copilot 会话中，通过名称引用 Agent：

```
激活前端开发 Agent，帮我构建一个 React 组件。
```

```
使用 Reality Checker Agent 验证此功能是否已准备好投入生产。
```

## Agent 目录

Agent 按部门组织。请参阅[主 README](../../README.md) 获取完整当前列表。
