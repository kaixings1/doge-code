---
name: cmux-custom-sidebar
description: 根据自然语言请求构建自定义 cmux 侧边栏。当用户要求自定义侧边栏、显示其工作区/标签页/PR/时钟的侧边栏、vibe-coded 侧边栏，或涉及 ~/.config/cmux/sidebars/ 下文件的任何事宜时使用。涵盖编写解释执行的 SwiftUI 风格文件、启用 beta 标志、选中它，以及用热重载进行迭代。
---

# cmux 自定义侧边栏

cmux 在运行时从一个小型 SwiftUI 风格文件渲染自定义侧边栏：无需 Xcode、无需构建步骤、无需签名。该文件在保存时热重载，绑定到实时 cmux 状态（工作区、标签页、git、PR、时钟），并在点击时运行真实的 cmux 命令。

提出需求的人描述的是一个结果（一个显示我的工作区并让我在它们之间跳转的侧边栏），而非实现。替他们做出工程决策；不要向他们询问 SwiftUI、文件或语法。

本技能是工作流摘要。在编写非平凡侧边栏之前，请先阅读完整的编写契约（每个受支持的视图、修饰符、语言特性与数据字段）：

```bash
cmux docs sidebars
curl -fsSL https://raw.githubusercontent.com/manaflow-ai/cmux/main/docs/custom-sidebars.md
```

## 工作流

1. **启用 beta**（仅一次）：设置 > Beta 功能 > 自定义侧边栏（customSidebars.beta.enabled）。如果写好的侧边栏没有出现在选择器中，先检查此项。
2. **在 ~/.config/cmux/sidebars/<name>.swift 编写一个具名文件**。文件名即菜单标签；使用简短的 kebab-case。该文件是单个 SwiftUI 风格的视图表达式（无需 struct、无需 var body、无需 import）。存在用于静态布局的 .json 变体；任何动态场景都优先用 .swift。
3. **校验并选中：**
   ```bash
   cmux sidebar validate <name>   # 用真实数据结构做解析/解释检查
   cmux sidebar select <name>
   ```
   用户也可以右键点击侧边栏切换按钮来选择它。
4. **迭代。** 保存会就地热重载（cmux sidebar reload 可强制重载）。在宣布完成之前，先验证各行显示了真实数据，且点击行为符合预期。

## 编写规则

- 绑定到 workspaces 上下文，而不是硬编码文本，这样侧边栏能自行保持正确。
- 代表可打开对象的行应在点击时运行对应的 cmux(...) 动作。只显示文本的列表很少是他们真正想要的。
- 对类工作区列表使用 Reorderable；它免费提供可持久化的拖放重排。
- 保持原生且不杂乱：一个标题、一条分隔线，然后是内容。
- 对长列表设上限（.prefix(20)，渲染前先过滤/排序）。侧边栏大约每秒重新求值一次。
- 停留在受支持子集之内。不受支持的语法会被优雅跳过而非崩溃，但要选择最接近的受支持做法，而不是交付一个半空白的侧边栏。

## 快速上手

```bash
cat > ~/.config/cmux/sidebars/mine.swift <<'SWIFT'
VStack(alignment: .leading, spacing: 8) {
    Text("我的侧边栏").font(.title3).bold()
    Text(clock.time).font(.caption).foregroundColor(.secondary)
    Divider()
    Reorderable(workspaces, move: "workspace.reorder") { w in
        Button(action: { cmux("workspace.select", workspace_id: w.id) }) {
            HStack {
                Text(w.selected ? "●" : "○").foregroundColor(w.selected ? "#FF8800" : .secondary)
                Text(w.title)
                Spacer()
            }.padding(4)
        }
    }
}
SWIFT
cmux sidebar validate mine && cmux sidebar select mine
```

## 实时数据上下文（只读，约 1 秒刷新）

- `workspaces`: `id`、`title`、`selected`、`pinned`、`index`、`directory`、`ports` + `portCount`、`unread`、`tabs` + `tabCount`；存在时还包括 `description`、`color`、`branch` + `dirty`、`pr` / `prs`（`{number, label, url, status, stale, branch}`）、`progress`（`{value, label}`）、`latestMessage`、`latestPrompt`、`latestAt`、`remote`（`{target, state, connected}`）。
- `workspaces[i].tabs`: `id`、`title`、`focused`、`pinned`；在可用时还有 `directory`、`branch` + `dirty`、`ports`。
- `clock`: `{time, hour, minute, second, weekday, epoch}`。
- 标量：`workspaceCount`、`selectedTitle`、`selectedId`、`unreadTotal`。

可选字段在缺失时被省略；用 if let b = w.branch { ... } 或 w.pr != nil ? ... : ... 加以保护。

## 动作

按钮或 .onTapGesture 的主体调用 cmux("<method>", param: value)，通过同一界面分发，与 CLI 一致。常用方法：workspace.select（workspace_id）、surface.focus（surface_id）、workspace.reorder（workspace_id 加 index）。openURL("https://...") 可打开链接。完整命令面见 cmux docs api。

## 受支持子集

容器：堆叠容器（包括 lazy）、`Group`、`List`、`Section`、网格、`ViewThatFits`、`ScrollView`、`HSplitView`（两列可调整大小）。内容：`Text`、`Label`、`Image(systemName:)`、`Button`（标题形式与 label 形式）、`Menu`、`ProgressView`、`Gauge`、`Spacer`、`Divider`、形状、通过 `.background` 实现的渐变。修饰符：完整排版集合、以十六进制字符串或 token 表示的颜色、`.padding`/`.frame`/布局、`.background`/`.overlay`/`.mask`/`.contextMenu` 搭配任意嵌套视图、阴影/边框/不透明度/效果、`.onTapGesture`、`.help`、`.disabled`。语言：`let`、用户自定义 `func` 辅助函数、`for`/`ForEach`、`if/else`、三元表达式、字符串插值、算术、数组方法（`filter`/`map`/`sorted`/`prefix`）、字符串与数字格式化。

尚不支持（但仍按自然 Swift 书写，它会优雅降级）：@State 与输入控件（TextField、Toggle、Slider、Picker）、自定义 struct/View 定义、导航（sheet/popover）、AsyncImage。双向编辑尚不可用；运行 cmux(...) 的点击则可用。

## 故障排查

- 右键选择器中缺失：beta 标志被关闭，或文件不直接位于 ~/.config/cmux/sidebars/ 之下。
- 空白或部分渲染：运行 cmux sidebar validate <name>。错误会在侧边栏内随失败位置内联显示；一次损坏的保存会让最后一次可用的渲染留在屏幕上，因此修复后要重新保存。
- 行不可点击：把该行包进 Button(action: { cmux(...) }) { ... }，或添加 .onTapGesture { cmux(...) }。
- 重排未持久化：使用 Reorderable(data, move: "workspace.reorder")，而非 List、.onMove 或 .draggable。
