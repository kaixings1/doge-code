# Windsurf 集成

所有 61 个 Agency Agent 已合并到单个 `.windsurfrules` 文件中。
规则是**项目级别的**——请从项目根目录安装。

## 安装

```bash
# 从项目根目录运行
cd /your/project
/path/to/agency-agents/scripts/install.sh --tool windsurf
```

## 激活 Agent

在 Windsurf 中，通过名称在提示中引用 Agent：

```
使用前端开发 Agent 来构建此组件。
```

## 重新生成

```bash
./scripts/convert.sh --tool windsurf
```
