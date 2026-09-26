---
name: cmux-localization
description: "cmux 界面文案、设置行、菜单、快捷键、schema/配置文本、文档、命令/帮助文本、弹窗、工具提示以及 web 消息的本地化规则与审计流程。凡涉及修改面向用户的文本时使用。"
---

# cmux 本地化

任何面向用户的字符串改动都要使用本技能。

## 硬性规则

- 每个面向用户的字符串都要本地化。绝不要在 SwiftUI 的 `Text()`、`Button()`、弹窗标题、工具提示、菜单或对话框中直接写裸字符串字面量。
- Swift/AppKit/SwiftUI：使用 `String(localized: "key.name", defaultValue: "English text")`，并在 `Resources/Localizable.xcstrings` 中为所有受支持的语言（目前是英语和日语）翻译这些键。
- `defaultValue`、英文回退文本、schema 描述以及复制来的英文字符串都不算作本地化。
- Web/文档的本地化内容要更新每一个受支持的消息目录（目前是 `web/messages/en.json` 和 `web/messages/ja.json`），以及任何携带内联翻译的本地化数据结构。
- 每一次面向用户的改动都必须做本地化审计。

## 审计清单

在完成一项会改动 UI、设置行、菜单、快捷键元数据、schema/配置文本、文档、命令/帮助文本、弹窗或工具提示的任务之前：

1. 逐一列举被改动的面向用户界面。
2. 核实每个界面在每一种受支持的 locale 下都有对应条目。
3. 解析被触及的本地化文件，并跨 locale 比较发生变化的消息键。
4. 对改动过的 Swift/TS/TSX/文档文件运行 `rg`，查找新引入的裸英文。
5. 在最终交接中说明执行了哪些审计，或明确说明哪些内容无法核实。

## 详细参考

- [references/audit-workflow.md](references/audit-workflow.md)：什么算面向用户、搜索模式以及交接措辞。

新增键盘快捷键同样需要文档和设置项；参见 [../cmux-keyboard-shortcuts/SKILL.md](../cmux-keyboard-shortcuts/SKILL.md)。
