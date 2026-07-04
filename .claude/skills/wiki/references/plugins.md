# Obsidian 设置

---

## 安装 Obsidian

### Linux（Flatpak：推荐）

检查是否已安装：
```bash
flatpak list 2>/dev/null | grep -i obsidian && echo "已通过 flatpak 找到" || \
which obsidian 2>/dev/null && echo "已在 PATH 中找到" || echo "未找到"
```

如果未找到则安装：
```bash
flatpak install flathub md.obsidian.Obsidian
```

### macOS

```bash
ls /Applications/Obsidian.app 2>/dev/null && echo "已找到" || brew install --cask obsidian
```

### Windows

```powershell
Test-Path "$env:LOCALAPPDATA\Obsidian" && echo "已找到" || winget install Obsidian.Obsidian
```

### 所有平台：直接下载

https://obsidian.md/download

---

## 打开 Vault

安装后：Obsidian > 管理 Vault > 将文件夹作为 Vault 打开 > 选择你的 Vault 目录。

---

## 核心插件（内置：无需安装）

这些随 Obsidian 一起提供。在设置 > 核心插件中启用：

| 插件 | 用途 |
|------|------|
| **Bases** | `.base` 文件的原生类数据库视图。驱动 `wiki/meta/dashboard.base`。自 Obsidian v1.9.10（2025 年 8 月）起可用。**对于大多数 Wiki 用例，可替代 Dataview。** |
| **Properties** | 可视化前置元数据编辑器。始终启用。 |
| **Backlinks** | 出站/入站链接面板。 |
| **Outline** | 文档标题导航。 |

## 推荐的社区插件

通过设置 > 第三方插件 > 关闭安全模式 > 浏览安装。

| 插件 | 用途 |
|------|------|
| **Templater** | 从 `_templates/` 创建笔记时自动填充前置元数据。 |
| **Obsidian Git** | 每 15 分钟自动提交。防止错误写入。 |
| **Calendar** | 右侧边栏日历，含字数、任务和链接指示器。通过 `.obsidian/plugins/calendar/` 预安装在此 Vault 中。 |
| **Thino** | 右侧边栏快速备忘录捕获面板。通过 `.obsidian/plugins/thino/` 预安装。 |
| **Iconize** | 导航的可视化文件夹图标。 |
| **Minimal Theme** | 适合密集信息显示的最佳暗色主题。 |
| **Dataview** *（可选/旧版）* | 仅当你使用 Obsidian < 1.9.10 或想使用旧版 `dashboard.md` 查询时才需要。主仪表板现在使用 Bases。 |

**Calendar 和 Thino 已预安装**。它们随此 Vault 一起提供。在设置 → 第三方插件中启用开关即可。无需下载。

如果在其他 Vault 中安装：从其 GitHub 发布版本下载 `main.js` + `manifest.json`，分别放入 `.obsidian/plugins/calendar/` 和 `.obsidian/plugins/thino/`。

可选附加：
- **Smart Connections**：跨所有笔记的语义搜索
- **QuickAdd**：快速创建笔记的宏
- **Folder Notes**：点击文件夹打开概览笔记

---

## Web Clipper

Obsidian Web Clipper 浏览器扩展可将网页文章转换为 Markdown，一键发送到 `.raw/`。

从 Obsidian 网站为 Chrome、Firefox 或 Safari 安装。

在扩展设置中将默认文件夹设置为 `.raw/`。

---

## 安装插件后

1. 启用 Bases：设置 > 核心插件 > 开启开关（Obsidian v1.9.10+ 上默认已开启）
2. 启用 Templater：设置 > Templater > 将模板文件夹设置为 `_templates`
3. 启用 Obsidian Git：设置 > Obsidian Git > 自动备份间隔：15 分钟
4. 启用 CSS 代码片段：设置 > 外观 > CSS 代码片段 > 开启 `vault-colors`
5. *（可选）* 仅当你想让旧版 `wiki/meta/dashboard.md` 查询与主 `dashboard.base` 一起工作时才启用 Dataview
