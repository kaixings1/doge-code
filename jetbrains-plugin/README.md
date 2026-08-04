# Doge Code JetBrains 插件

Doge Code 的 JetBrains 插件，提供 AI 聊天和用量统计功能。

## 功能

- 🐕 侧边栏聊天窗口 — 在 JetBrains IDE 中与 Doge Code 对话
- 📊 用量统计 — 查看费用和 Token 用量
- ⚙️ 设置面板 — 配置服务器地址

## 构建

```bash
./gradlew buildPlugin
```

插件将生成在 `build/distributions/` 目录下。

## 安装

1. 打开 JetBrains IDE
2. 进入 `Settings → Plugins → Install from Disk`
3. 选择 `build/distributions/doge-code-*.zip`

## 使用

1. 先启动 Doge Code CLI 和仪表盘：
   ```bash
   doge /dashboard open
   ```

2. 在 JetBrains IDE 中：
   - 点击右侧工具栏的 `Doge Code` 图标
   - 或通过 `Tools → Doge Code 聊天` 打开

## 配置

进入 `Settings → Tools → Doge Code`：

| 设置 | 默认值 | 说明 |
|------|--------|------|
| 服务器地址 | `http://127.0.0.1:3456` | Doge Code 服务器地址 |

## 支持 IDE

- IntelliJ IDEA
- PyCharm
- WebStorm
- PhpStorm
- RubyMine
- CLion
- GoLand
- Rider
- DataGrip
- 其他 JetBrains 系列 IDE
