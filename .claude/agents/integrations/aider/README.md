# Aider 集成

所有 61 个 Agency 代理已合并到单个 `CONVENTIONS.md` 文件中。
当该文件存在于项目根目录时，Aider 会自动读取。

## 安装

```bash
# 从项目根目录运行
cd /your/project
/path/to/agency-agents/scripts/install.sh --tool aider
```

## 激活代理

在 Aider 会话中，通过名称引用代理：

```
使用前端开发代理来重构此组件。
```

```
应用 Reality Checker 代理来验证此代码是否已准备好投入生产。
```

## 手动使用

你也可以直接传递约定文件：

```bash
aider --read CONVENTIONS.md
```

## 重新生成

```bash
./scripts/convert.sh --tool aider
```
