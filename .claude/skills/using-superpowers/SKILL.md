---
name: using-superpowers
description: 在开始任何对话时使用——确立如何查找和使用技能，要求在任何响应（包括澄清性问题）之前调用 Skill 工具
version: "1.0.0"
license: MIT
metadata:
  hermes:
    tags: [meta, getting-started]
---

<SUBAGENT-STOP>
如果你是作为子智能体被分派来执行特定任务的，跳过此技能。
</SUBAGENT-STOP>

<EXTREMELY-IMPORTANT>
如果你认为哪怕只有 1% 的可能性某个技能适用于你正在做的事情，你绝对必须调用该技能。

如果一个技能适用于你的任务，你没有选择。你必须使用它。

这不可协商。这不是可选的。你不能通过合理化来逃避。
</EXTREMELY-IMPORTANT>

## 指令优先级

Superpowers 技能覆盖默认系统提示行为，但**用户指令始终具有最高优先级**：

1. **用户的明确指令**（CLAUDE.md、GEMINI.md、AGENTS.md、直接请求）——最高优先级
2. **Superpowers 技能** ——在冲突处覆盖默认系统行为
3. **默认系统提示** ——最低优先级

如果 CLAUDE.md、GEMINI.md 或 AGENTS.md 说"不要使用 TDD"，而某个技能说"始终使用 TDD"，遵循用户的指令。用户拥有控制权。

## 如何访问技能

**在 Claude Code 中：** 使用 `Skill` 工具。当你调用一个技能时，其内容会被加载并呈现给你——直接遵循即可。绝不要用 Read 工具读取技能文件。

**在 Copilot CLI 中：** 使用 `skill` 工具。技能从已安装的插件中自动发现。`skill` 工具的工作方式与 Claude Code 的 `Skill` 工具相同。

**在 Hermes Agent 中：** 使用 `skill_view` 工具加载技能。Hermes 支持三级渐进式加载：`skills_list` 浏览 → `skill_view(name)` 加载完整内容 → `skill_view(name, path)` 查看引用文件。

**在 Gemini CLI 中：** 技能通过 `activate_skill` 工具激活。Gemini 在会话开始时加载技能元数据，并按需激活完整内容。

**在其他环境中：** 查看你的平台文档了解技能的加载方式。

## 平台适配

技能使用 Claude Code 的工具名称。非 CC 平台：查看 `references/copilot-tools.md`（Copilot CLI）、`references/hermes-tools.md`（Hermes Agent）、`references/codex-tools.md`（Codex）、`references/qoder-tools.md`（Qoder）了解工具对应关系。Gemini CLI 用户通过 GEMINI.md 自动获得工具映射。

# 使用技能

## 规则

**在任何响应或操作之前调用相关或被请求的技能。** 哪怕只有 1% 的可能性某个技能适用，你都应该调用该技能来检查。如果调用后发现技能不适合当前情况，你不需要使用它。

```dot
digraph skill_flow {
    "收到用户消息" [shape=doublecircle];
    "即将进入 EnterPlanMode？" [shape=doublecircle];
    "已经头脑风暴过？" [shape=diamond];
    "调用头脑风暴技能" [shape=box];
    "可能有技能适用？" [shape=diamond];
    "调用 Skill 工具" [shape=box];
    "宣布：'使用 [技能] 来 [目的]'" [shape=box];
    "有检查清单？" [shape=diamond];
    "为每个条目创建 TodoWrite 待办" [shape=box];
    "严格遵循技能" [shape=box];
    "响应（包括澄清）" [shape=doublecircle];

    "即将进入 EnterPlanMode？" -> "已经头脑风暴过？";
    "已经头脑风暴过？" -> "调用头脑风暴技能" [label="否"];
    "已经头脑风暴过？" -> "可能有技能适用？" [label="是"];
    "调用头脑风暴技能" -> "可能有技能适用？";

    "收到用户消息" -> "可能有技能适用？";
    "可能有技能适用？" -> "调用 Skill 工具" [label="是，哪怕只有 1%"];
    "可能有技能适用？" -> "响应（包括澄清）" [label="确定不适用"];
    "调用 Skill 工具" -> "宣布：'使用 [技能] 来 [目的]'";
    "宣布：'使用 [技能] 来 [目的]'" -> "有检查清单？";
    "有检查清单？" -> "为每个条目创建 TodoWrite 待办" [label="是"];
    "有检查清单？" -> "严格遵循技能" [label="否"];
    "为每个条目创建 TodoWrite 待办" -> "严格遵循技能";
}
```

## 红线

这些想法意味着停下——你在合理化：

| 想法 | 现实 |
