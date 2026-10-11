package com.dogecode.mobile

/**
 * 本地模式的系统提示词。
 *
 * ## 为什么提示词要显式声明「能力边界」
 *
 * 模型会**按训练经验假设**自己在一个完整开发环境里（有 shell、有 git、
 * 能跑测试）。若不明说限制，它会：
 * · 反复尝试 `run_command`（工具列表里根本没有，于是空转）
 * · 给出「请运行 npm test 验证」这类**在手机上无法执行**的建议
 * · 以为能访问任意路径，读到权限错误后开始乱试
 *
 * 明确告知边界，比让它自己撞墙更省 token、体验也更一致。
 *
 * ## 为什么提示词是纯函数而非硬编码常量
 *
 * 工作区路径需要动态插入（让模型知道「当前在哪」）。
 * 抽成函数以便单测断言「边界声明确实存在」——
 * 若有人不慎删掉「不能执行命令」那段，测试会失败。
 */
object SystemPrompt {

    /** 工具能力清单（与 [LocalTools.specs] 保持一致）。 */
    private val TOOLS_DESC = """
- read_file：读文件（带行号）
- edit_file：精确替换文件中的一段文本（改动前必须先 read_file）
- write_file：写文件（整文件覆盖；只改局部时优先用 edit_file）
- list_dir：列目录
- search_in_files：在文件里搜索文本（可传 regex=true 按正则搜）
- glob：按模式查找文件（找文件优先用它，比逐层 list_dir 快）
- todo：维护任务清单（多步任务用它追踪进度）
- run_command：经 Termux 执行**受限命令**（只读/常见工具），返回 stdout/stderr。
  仅白名单内的命令前缀可用（ls/cat/grep/find/git/python3/node 等），
  **不支持**管道、;、&&、重定向、命令替换等 shell 语法（每次一条简单命令），
  且只能在工作区内执行。未安装 Termux 时会报错提示。计算或改文件优先用
  write_file/edit_file，而非本工具。
""".trim()

    /**
     * 技能说明（由 [build] 注入）。
     *
     * 模型用 `use_skill_<id>` 这类工具调用技能；调用后该技能的专家工作流
     * 会被注入下一轮上下文（作为工具结果回填）。这里只给**调用约定**，
     * 具体技能清单（名称与何时用）由 [AgentLoop] 通过 extraSpecs 动态提供，
     * 故此处不罗列技能明细，只约定「如何调用 / 收到后如何对待」。
     */
    private val SKILLS_DESC = """
除了上面的工具，你还能**调用技能**（专家工作流）。技能以 `use_skill_<id>`
命名（完整清单见工具列表）。调用技能时：只传必要的补充说明，不要编造
技能不存在的参数。收到技能注入后，把它当作**后续工作的指引**遵循执行，
而非一次性动作。
""".trim()

    /**
     * 生成系统提示词。
     *
     * @param workspaceName 工作区显示名（通常取目录名）
     * @param planMode 是否开启 plan 模式。开启时会告知模型先产出结构化计划再
     *   执行（与 [AgentLoop.planMode] 配套）。**默认 false** 保持与原行为一致。
     * @param enableDelegate 是否在提示词里声明 `delegate_task` 工具。必须与
     *   [AgentLoop.enableDelegate] 保持一致 —— 提示词说明了工具，循环才真的
     *   注入它；两者默认都为 false，避免旧调用点出现「模型看到却调不到」的工具。
     */
    fun build(
        workspaceName: String,
        planMode: Boolean = false,
        enableDelegate: Boolean = false,
    ): String {
        val tools = buildString {
            append(TOOLS_DESC)
            if (enableDelegate) {
                append(
                    "\n- delegate_task：把一个子任务委派给一个独立子代理去执行（子代理" +
                        "拥有相同的工具但独立上下文，完成后再把结果回填）。可用于把大任务" +
                        "拆分给多个子代理串行/并行处理。子代理**不能再次委派**。",
                )
            }
        }
        val planning = if (planMode) {
            """
## 计划模式（plan mode）

本次任务已开启**计划模式**。请先**只输出一份结构化的分步计划**（用带序号的
清单，例如「1. … 2. … 3. …」），**不要在这个阶段执行任何工具**。计划会作为
后续执行的依据。进入执行阶段后，请严格按计划推进，并在每完成一步时用 todo
工具更新进度（设 in_progress / completed），让用户随时看到当前进度。
"""
        } else {
            ""
        }
        return """
你是一个运行在 Android 手机上的编程助手。你能读写用户选定目录里的文件。

## 工作区

当前工作区：$workspaceName
所有路径都相对于工作区根目录。**不要使用绝对路径** —— 会被拒绝。

## 可用工具

$tools

## 技能（专家工作流）

$SKILLS_DESC

## 重要限制（必须遵守）

1. **命令执行受严格限制（经 Termux）**。可用 `run_command` 跑**白名单内**
   的只读/常见命令（ls/cat/grep/find/git/python3/node 等）。**严禁**
   管道、分号、&&、重定向、命令替换等 shell 语法；每次只能一条简单命令。
   **不能执行破坏性命令**（rm/cp/mv/mkdir/sudo/dd 等不在白名单）。
   命令的工作目录必须落在工作区内。未装 Termux 时该工具会报错，请提示用户安装。
2. **不能访问工作区外的文件**。绝对路径与 `..` 越界都会被拒绝。
3. **没有网络访问**（除调用你自己）。

## 工作方式

- 改动文件前**先用 read_file 看清现状** —— edit_file 会拒绝编辑未读过的文件。
- **优先用 edit_file 而非 write_file**：只改局部时整文件重写既浪费又容易漏内容。
- **多步任务先用 todo 建清单**，开始做某项设 in_progress（同时只一个），做完立即设 completed。
- 一次只做必要的事，不要把没让改的地方也改了。
- 回答用中文，简洁直接。
$planning
""".trim()
    }

    /**
     * 提示词中**必须存在**的边界声明（供测试断言）。
     *
     * 抽成常量而非让测试硬编码文案：这样文案改了只需改一处，
     * 且「哪些边界是必须声明的」这件事本身有了明确清单。
     *
     * 注意：旧版要求含「不能执行命令」。现在本地模式**已支持经 Termux 的
     * 受限命令**，故该条改为强调「受限」—— 但「不能访问工作区外」仍是铁律。
     */
    val REQUIRED_DISCLAIMERS = listOf(
        "命令执行受严格限制",
        "不能访问工作区外",
    )

    /**
     * 提示词中**必须包含**的能力说明（供测试断言 run_command 已接入）。
     *
     * 双向契约：specs() 加了 run_command，提示词必须同步出现，否则模型
     * 不知道有它（等于没加）。
     */
    val REQUIRED_CAPABILITIES = listOf(
        "run_command",
    )

    /**
     * 提示词中**必须不存在**的诱导性表述。
     *
     * 这些词会让模型以为有「无限制 shell」能力，从而尝试危险的自由命令。
     */
    val FORBIDDEN_HINTS = listOf(
        "运行任意命令",
        "完整 shell",
    )
}
