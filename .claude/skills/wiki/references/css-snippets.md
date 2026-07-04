# 视觉自定义

在搭建时应用。使文件资源管理器按文件夹类型进行颜色编码，并添加自定义标注样式。

---

## CSS 代码片段

在 Vault 内的 `.obsidian/snippets/vault-colors.css` 路径下创建此文件：

```css
:root {
  --wiki-1: #4fc1ff;
  --wiki-2: #c586c0;
  --wiki-3: #dcdcaa;
  --wiki-4: #ce9178;
  --wiki-5: #6a9955;
  --wiki-6: #d16969;
  --wiki-7: #569cd6;
}

/* 文件资源管理器中的文件夹颜色 */
.nav-folder-title[data-path^="wiki/domains"]     { color: var(--wiki-1); }
.nav-folder-title[data-path^="wiki/entities"]    { color: var(--wiki-2); }
.nav-folder-title[data-path^="wiki/concepts"]    { color: var(--wiki-3); }
.nav-folder-title[data-path^="wiki/sources"]     { color: var(--wiki-4); }
.nav-folder-title[data-path^="wiki/questions"]   { color: var(--wiki-5); }
.nav-folder-title[data-path^="wiki/comparisons"] { color: var(--wiki-6); }
.nav-folder-title[data-path^="wiki/meta"]        { color: var(--wiki-7); }
.nav-folder-title[data-path=".raw"]              { color: #808080; opacity: 0.6; }

/* 自定义标注 */
.callout[data-callout='contradiction'] {
  --callout-color: 209, 105, 105;
  --callout-icon: lucide-alert-triangle;
}
.callout[data-callout='gap'] {
  --callout-color: 220, 220, 170;
  --callout-icon: lucide-help-circle;
}
.callout[data-callout='key-insight'] {
  --callout-color: 79, 193, 255;
  --callout-icon: lucide-lightbulb;
}
.callout[data-callout='stale'] {
  --callout-color: 128, 128, 128;
  --callout-icon: lucide-clock;
}
```

---

## 启用代码片段

告知用户：设置 > 外观 > CSS 代码片段 > 打开文件夹 > 粘贴文件 > 点击刷新图标 > 开启开关。

---

## 图谱视图分组

引导用户在图谱视图设置中设置这些（点击图谱视图中的设置图标）：

| 查询 | 颜色 |
|------|------|
| `path:wiki/domains` | 蓝色（`#4fc1ff`） |
| `path:wiki/entities` | 紫色（`#c586c0`） |
| `path:wiki/concepts` | 黄色（`#dcdcaa`） |
| `path:wiki/sources` | 橙色（`#ce9178`） |
| `path:wiki/questions` | 绿色（`#6a9955`） |
| `path:.raw` | 灰色（暗淡） |

---

## 自定义标注

此 Vault 定义了 Obsidian 内置集（`note`、`tip`、`warning`、`info`、`todo`、`success`、`question`、`failure`、`danger`、`bug`、`example`、`quote`）之外的 **四种自定义标注类型**。它们**仅在 `vault-colors.css` 启用时**正确渲染。没有该代码片段时，会回退到默认标注样式（仍可读，只是朴素）。

| 自定义标注 | 颜色 | 图标 | 用途 |
|---|---|---|---|
| `contradiction` | 红棕色（rgb 209,105,105） | `lucide-alert-triangle` | 新来源与现有声明冲突 |
| `gap` | 米色（rgb 220,220,170） | `lucide-help-circle` | 主题尚无来源 |
| `key-insight` | 亮蓝色（rgb 79,193,255） | `lucide-lightbulb` | 值得强调的重要见解 |
| `stale` | 灰色（rgb 128,128,128） | `lucide-clock` | 声明可能已过时，来源早于阈值 |

### 用法

在 Wiki 页面中使用这些来标记重要状态：

```markdown
> [!contradiction] 标题
> [[页面 A]] 声称 X。[[页面 B]] 说是 Y。需要解决。

> [!gap] 标题
> 此主题尚无来源。考虑寻找一个。

> [!key-insight] 标题
> 本部分最重要的收获。

> [!stale] 标题
> 此声明可能已过时。来源来自 2022 年。
```

### 为什么使用自定义标注（vs 内置）

四种自定义类型映射到 Wiki 特有概念，不完全适合 Obsidian 的默认分类：

- `contradiction` 比 `warning` 更具体：它表示两个 Wiki 页面之间的**可解决的冲突**，而非泛泛的警告。
- `gap` 比 `question` 更具体：它表示**缺失的来源**，是一个可操作的改进点。
- `key-insight` 比 `tip` 更具体：它标记某部分**最重要的**收获，使用有节制。
- `stale` 没有内置等价项：它表示声明基于时间的过期。

如果不想使用自定义标注，可以用内置标注替换：
- `[!contradiction]` → `[!warning] 矛盾`
- `[!gap]` → `[!question] 缺口`
- `[!key-insight]` → `[!tip] 关键见解`
- `[!stale]` → `[!warning] 过期`

---

## Minimal 主题（推荐）

配色方案在 Minimal 主题下效果最佳。通过设置 > 外观 > 管理 > 搜索 "Minimal" 安装。
