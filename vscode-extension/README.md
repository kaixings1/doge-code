# Doge Code VS Code 扩展

Doge Code 的 VS Code 扩展，提供 AI 聊天和用量统计功能。

## 功能

- 🐕 AI 聊天面板 — 在 VS Code 中与 Doge Code 对话
- 📊 用量统计 — 实时查看费用和 Token 用量
- ⚙️ 配置面板 — 自定义服务器地址和功能开关

## 安装

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 在 VS Code 中按 F5 启动调试
```

## 使用

1. 先启动 Doge Code CLI 和仪表盘：
   ```bash
   doge /dashboard open
   ```

2. 在 VS Code 中：
   - 按 `Ctrl+Shift+P` 打开命令面板
   - 输入 `Doge Code: 打开聊天`
   - 或点击侧边栏的 Doge Code 图标

## 配置

在 VS Code 设置中搜索 `doge-code`：

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `doge-code.serverUrl` | `http://127.0.0.1:3456` | Doge Code 服务器地址 |
| `doge-code.enableChat` | `true` | 启用聊天功能 |
| `doge-code.enableAutocomplete` | `false` | 启用自动补全 |

## 命令

| 命令 | 说明 |
|------|------|
| `Doge Code: 打开聊天` | 打开聊天面板 |
| `Doge Code: 显示用量统计` | 显示费用统计 |
