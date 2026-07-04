---
name: window-management
description: 窗口管理技能
---

# 窗口管理

## 概览

使用此技能为每个 SwiftUI 窗口定制其任务。首先识别哪个场景拥有该窗口（`Window`、`WindowGroup` 或专用工具场景），然后自定义工具栏/标题区域、背景材质、调整大小和恢复行为，以及初始或缩放放置。

当 SwiftUI 直接提供相应行为时，优先使用场景和窗口修饰符而非临时的 AppKit 桥接。保持每个窗口专用：主浏览器窗口、关于窗口和媒体播放器窗口通常需要不同的装饰、可调整大小性、恢复和放置规则。

这些 API 是 macOS 15+ 的 SwiftUI 窗口/场景定制。对于较旧的部署目标，预计需要使用更多的 AppKit 桥接或可用性防护。

## 工作流

1. 检查相关场景声明并分类窗口角色：主应用导航、检查器/详情工具、关于/支持窗口、媒体播放窗口、欢迎窗口或无边框自定义表面。
2. 调整工具栏和标题展示以匹配内容。
3. 如果工具栏背景或整个工具栏被隐藏，确保窗口仍有可用的拖拽区域。
4. 优化该角色的窗口行为：最小化可用性、恢复、调整大小预期以及窗口是否应在启动时出现。
5. 为新打开的窗口设置默认放置，以及当内容和显示尺寸重要时设置缩放的理想放置。
6. 使用 `build-run-debug` 构建并启动应用，在真实的前景 `.app` 包中验证结果。
7. 如果 SwiftUI 场景/窗口修饰符不够用，切换到 `appkit-interop` 以实现窄范围的 `NSWindow` 桥接，而不是将 AppKit 散布到视图树中。

## 工具栏和标题

- 当窗口标题应保留与窗口的关联（用于无障碍和菜单）但不在标题栏中可见绘制时，使用 `.toolbar(removing: .title)`。
- 当大型媒体或主打内容应视觉延伸到窗口顶部边缘时，使用 `.toolbarBackgroundVisibility(.hidden, for: .windowToolbar)`。
- 如果窗口仍需要关闭/最小化/全屏控制，仅移除标题和工具栏背景。如果工具栏应完全消失，改用 `.toolbarVisibility(.hidden, for: .windowToolbar)`。
- 在叠加新的 SwiftUI 工具栏 API 之前，移除自定义工具栏背景和手动绘制的标题栏填充。
- 即使标题被隐藏，也要保持窗口的逻辑标题有意义；系统仍可将其用于无障碍和菜单项。这些仅是视觉更改。

## 拖拽区域

- 如果工具栏背景被隐藏或工具栏被完全移除，使用 `WindowDragGesture()` 将可拖拽区域扩展到你的内容中。
- 将手势附加到透明的覆盖层或非交互式头部区域，该区域不会从真实控件那里窃取手势。
- 对于具有自定义播放控件的媒体播放器，在视频内容和控件之间插入拖拽覆盖层，以便 AVKit 或传输控件继续接收输入。
- 将拖拽手势与 `.allowsWindowActivationEvents(true)` 配对，以便点击并立即拖拽后台窗口时仍能激活并移动它。

## 背景和材质

- 当工具窗口或关于窗口应用微妙的磨砂材质替换默认窗口背景时，使用 `.containerBackground(.thickMaterial, for: .window)`。
- 优先使用系统材质来实现风格化窗口，而非硬编码的半透明颜色。
- 特别适用于固定内容的工具窗口，其中较柔和的背景是设计的一部分。

## 窗口行为

- 对于始终可访问的工具窗口（如自定义关于窗口，最小化价值不大），使用 `.windowMinimizeBehavior(.disabled)`。
- 当窗口内容只有一个预期大小时，通过固定尺寸或窗口约束禁用绿色缩放控件。
- 对于不应在下次启动时重新打开的窗口，使用 `.restorationBehavior(.disabled)`，如关于面板、临时支持/信息窗口或首次运行的欢迎界面。
- 对于主文档或导航窗口，当希望重新打开时保留之前的大小和位置时，保持状态恢复启用。
- 默认情况下，SwiftUI 遵循用户系统范围的 macOS 状态恢复设置。仅当特定窗口应有意选择加入或退出该系统行为时，才使用 `restorationBehavior(...)`。
- 对于应在启动时首先出现的窗口（如欢迎窗口），使用 `.defaultLaunchBehavior(.presented)`，并有意识地选择该行为，而非依赖场景创建顺序的副作用。

## 窗口放置

- 使用 `.defaultWindowPlacement { content, context in ... }` 控制新打开窗口的初始大小和可选位置。
- 在放置闭包内部，调用 `content.sizeThatFits(.unspecified)` 获取内容的理想尺寸。
- 读取 `context.defaultDisplay.visibleRect` 获取扣除菜单栏和 Dock 后的显示器可用区域。
- 当媒体或文档内容可能大于显示器时，返回尺寸限制在可见矩形内的 `WindowPlacement(size: size)`。如果未提供位置，默认居中。
- 使用 `.windowIdealPlacement { content, context in ... }` 控制当用户从窗口菜单中选择缩放或 Option-点击绿色工具栏按钮时的行为。对于媒体窗口，保持宽高比并增长到适合显示器的最大尺寸。
- 将默认放置和理想放置视为独立策略：
  - 默认放置控制新窗口首次出现的位置，
  - 理想放置控制缩放后的窗口应该有多大。
- 在根据内容尺寸调整播放器窗口或文档窗口大小时，始终考虑外接显示器和旋转/窄屏。

## 无边框和专用窗口

- 对于无边框或高度自定义装饰的窗口，使用 `.windowStyle(.plain)`，但要确保内容仍提供清晰的拖拽/移动提示和可见上下文。
- 对于无边框播放器、HUD 或欢迎窗口，预先决定失去标准标题栏功能是否值得自定义展示。
- 如果无边框样式使窗口感觉不可见或难以移动，保留一条返回常规窗口管理的清晰路径。

## API 代码片段

```swift
WindowGroup("Destination Video") {
  CatalogView()
    .toolbar(removing: .title)
    .toolbarBackgroundVisibility(.hidden, for: .windowToolbar)
}
```

```swift
Window("About", id: "about") {
  AboutView()
    .toolbar(removing: .title)
    .toolbarBackgroundVisibility(.hidden, for: .windowToolbar)
    .containerBackground(.thickMaterial, for: .window)
}
.windowMinimizeBehavior(.disabled)
.restorationBehavior(.disabled)
```

```swift
WindowGroup("Player", for: Video.self) { $video in
  PlayerView(video: video)
}
.defaultWindowPlacement { content, context in
  let idealSize = content.sizeThatFits(.unspecified)
  let displayBounds = context.defaultDisplay.visibleRect
  let fittedSize = clampToDisplay(idealSize, displayBounds: displayBounds)
  return WindowPlacement(size: fittedSize)
}
.windowIdealPlacement { content, context in
  let idealSize = content.sizeThatFits(.unspecified)
  let displayBounds = context.defaultDisplay.visibleRect
  let zoomedSize = zoomToFit(idealSize, displayBounds: displayBounds)
  let position = centeredPosition(for: zoomedSize, in: displayBounds)
  return WindowPlacement(position, size: zoomedSize)
}
```

```swift
PlayerView(video: video)
  .overlay(alignment: .top) {
    Color.clear
      .frame(height: 48)
      .contentShape(Rectangle())
      .gesture(WindowDragGesture())
      .allowsWindowActivationEvents(true)
  }
```

```swift
Window("Welcome", id: "welcome") {
  WelcomeView()
}
.windowStyle(.plain)
.defaultLaunchBehavior(.presented)
```

## 审查清单

- 场景类型与窗口的角色和生命周期匹配。
- 隐藏的标题仍为无障碍和菜单保留有意义的逻辑标题。
- 工具栏背景移除是有意的，不会损害标题栏可读性或窗口控件放置。
- 隐藏或移除了工具栏的窗口仍有可靠的拖拽区域，并支持从后台点击然后拖拽激活。
- 工具窗口具有与其用途匹配的恢复/最小化行为。
- 仅当场景应有意识地与用户系统范围设置不同时，才使用恢复覆盖。
- 当内容/显示尺寸重要时，默认和理想放置使用 `content.sizeThatFits(.unspecified)` 和 `context.defaultDisplay.visibleRect`。
- 媒体窗口保持宽高比，适配小型或旋转显示器。
- 无边框窗口仍有可用的移动/拖拽提示。

## 护栏

- 不要仅为了隐藏你忘记设置的标题而使用 `.toolbar(removing: .title)`。保持底层窗口标题有意义。
- 不要在没有替换丢失的拖拽提示的情况下隐藏工具栏背景或整个工具栏。
- 不要在主导文档/导航窗口上禁用恢复，除非用户明确希望每次启动都是全新开始。
- 在调整播放器窗口大小时，不要硬编码一个显示器尺寸或假设单显示器设置。
- 在检查 `.windowMinimizeBehavior`、`.restorationBehavior`、`.defaultWindowPlacement`、`.windowIdealPlacement`、`.windowStyle` 或 `.defaultLaunchBehavior` 是否已解决问题之前，不要直接使用 `NSWindow` 变更。
- 不要让普通的无边框窗口没有任何明显的拖拽或关闭路径。

## 何时使用其他技能

- 对于更广泛的场景、命令、设置、侧边栏和检查器架构，使用 `swiftui-patterns`。
- 当主要问题是现代 macOS 视觉处理、Liquid Glass 或系统材质采用时，使用 `liquid-glass`。
- 如果自定义窗口行为真正需要 `NSWindow`、`NSPanel` 或响应链控制，使用 `appkit-interop`。
- 使用 `build-run-debug` 启动并验证生成的窗口。
