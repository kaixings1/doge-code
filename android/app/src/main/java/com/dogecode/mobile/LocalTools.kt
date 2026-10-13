package com.dogecode.mobile

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * 本地模式的工具集（文件操作 + 经 Termux 的受限命令执行）。
 *
 * ## 关于「执行命令」：现在由 Termux 承担
 *
 * 历史版本里本类**不提供**执行命令工具 —— 因为 Android 应用沙箱不提供
 * shell（`Runtime.exec` 拿不到 `sh`/`grep`/`git`/`node`），内嵌解释器又
 * 太重。现在改为：**命令经 Termux 执行**。Termux 是用户自行安装的
 * 终端 App，自带完整的 shell 工具链。我们不再内嵌解释器，而是以
 * Android intent 调起 Termux，让它跑**白名单内的受限命令**，再把结果
 * 文件读回给模型（见 [runCommandViaTermux]）。
 *
 * 这不是「开放 shell」：命令前缀必须落在 [ALLOWED_COMMAND_PREFIXES]，
 * 且禁止 shell 元字符（管道/分号/重定向/命令替换），工作目录必须落在
 * [WorkspacePath] 校验过的工作区内。任何越界或危险命令都**返回可读错误**
 * 而非崩溃。
 *
 * ## 工具设计原则
 *
 * 1. **返回给模型的内容要带上下文**：读文件返回带行号的文本（模型引用
 *    行号才准确）；错误返回可读原因（「文件不存在」而非空）
 * 2. **每个工具都做上限**：手机上大文件会 OOM，必须在读之前拦
 * 3. **路径一律经 [WorkspacePath] 校验**：这是安全边界，不允许绕过
 */
object LocalTools {

    private const val TAG = "LocalTools"

    // ── todo（L2）：会话任务清单 ──

    /** 一条待办。 */
    data class Todo(
        val content: String,
        /** pending / in_progress / completed（与 CLI TodoWrite 同语义）。 */
        val status: String,
    )

    /**
     * 当前会话的待办清单（内存态）。
     *
     * ## 为什么是「整表替换」而非增删（吸收自 CLI TodoWrite 的设计）
     *
     * 增删式接口需要 id 对齐，模型极易弄错（漏传 id / 复用旧 id）。
     * 整表替换让模型每次都发「我认为的完整清单」—— 错了也只是覆盖成
     * 它自己最新的理解，不会产生幽灵条目。
     *
     * ## 为什么不放系统提示词而放「每轮追加一条上下文消息」
     *
     * 系统提示词在 AgentLoop 里只发一次且在首位；todo 是**动态**状态，
     * 每轮都要让模型看到最新版。放在 user 消息前的一条 system 短消息里，
     * 模型自然把它当「当前状态」而非「背景设定」。
     */
    private val todos = mutableListOf<Todo>()

    /**
     * 覆盖式更新待办清单（todo 工具的实现）。
     *
     * 校验吸收自 CLI 的 prompt.ts 规则：status 只接受三个值、
     * in_progress 最多一个、content 非空。错误信息面向模型自救。
     */
    private fun updateTodos(args: JSONObject): ToolResult {
        val arr = args.optJSONArray("todos") ?: return ToolResult.error("todo", "缺少 todos 数组")
        if (arr.length() > MAX_TODOS) {
            return ToolResult.error("todo", "待办最多 ${MAX_TODOS} 条（收到 ${arr.length()} 条）")
        }
        val parsed = ArrayList<Todo>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val content = o.optString("content").trim()
            val status = o.optString("status")
            if (content.isEmpty()) {
                return ToolResult.error("todo", "第 ${i + 1} 条待办的 content 为空")
            }
            if (status !in setOf("pending", "in_progress", "completed")) {
                return ToolResult.error(
                    "todo",
                    "第 ${i + 1} 条的 status 非法（$status）。" +
                        "只接受 pending / in_progress / completed。",
                )
            }
            parsed.add(Todo(content, status))
        }
        val inProgress = parsed.count { it.status == "in_progress" }
        if (inProgress > 1) {
            return ToolResult.error(
                "todo",
                "有 $inProgress 条同时处于 in_progress —— 同一时间只应有一个进行中任务。",
            )
        }
        synchronized(todos) {
            todos.clear()
            todos.addAll(parsed)
        }
        return ToolResult.of("todo", "已更新待办清单（${parsed.size} 条）。")
    }

    /**
     * 当前待办清单的渲染（供注入对话上下文）。
     *
     * 空清单返回 null —— 没有任务时不注入这条消息（省 token）。
     */
    fun currentTodoContext(): String? {
        val snapshot = synchronized(todos) { todos.toList() }
        if (snapshot.isEmpty()) return null
        return buildString {
            append("[当前待办清单]\n")
            snapshot.forEachIndexed { i, t ->
                val mark = when (t.status) {
                    "completed" -> "✓"
                    "in_progress" -> "▶"
                    else -> " "
                }
                append("$mark ${i + 1}. ${t.content}")
                if (t.status == "in_progress") append("（进行中）")
                append('\n')
            }
        }.trimEnd()
    }

    /** 待办条数上限（与 CLI TodoWrite 的清单规模量级一致）。 */
    const val MAX_TODOS = 20

    /** 清空待办（清空对话时调用 —— 新会话新计划）。 */
    fun clearTodos() {
        synchronized(todos) { todos.clear() }
    }

    /** 单次读取的最大字节数（超出时截断并告知）。 */
    const val MAX_READ_BYTES = 256 * 1024

    /** 单次写入的最大字节数（防止模型生成超大内容写爆存储）。 */
    const val MAX_WRITE_BYTES = 1024 * 1024

    /** 列目录时最多返回的条目数。 */
    const val MAX_LIST_ENTRIES = 500

    /** 搜索时最多返回的匹配数。 */
    const val MAX_SEARCH_HITS = 100

    /** 搜索时最多扫描的文件数（防在大目录里卡死）。 */
    const val MAX_SEARCH_FILES = 2000

    /**
     * 搜索时的递归深度上限。
     *
     * 为什么必需：递归 `walk()` 会随目录层数消耗调用栈，而 Android
     * 默认栈约 1MB —— 一个几千层深的目录树（如误建的递归软链结构）
     * 会直接 `StackOverflowError`。该错误是 `Error` 不是 `Exception`，
     * 外层 `catch (e: Exception)` **拦不住**，会崩掉整个 App。
     *
     * 取值 32：正常项目结构极少超过 15 层。
     */
    const val MAX_SEARCH_DEPTH = 32

    /**
     * 搜索时累计读取的字节上限。
     *
     * 为什么必需：`MAX_READ_BYTES` 只挡单个大文件，
     * 但 2000 个文件 × 各 200KB = **400MB** 的累计读取量同样会 OOM。
     * 单文件上限挡不住「数量多」这种情况。
     */
    const val MAX_SEARCH_TOTAL_BYTES = 16 * 1024 * 1024

    /** 单行返回长度上限（代码行可能极长）。 */
    private const val MAX_LINE_LEN = 2000

    /** 暴露给模型的工具定义（OpenAI function 格式）。 */
    fun specs(): List<ToolSpec> = listOf(
        ToolSpec(
            name = "read_file",
            description = "读取工作区内的文本文件，返回带行号的内容。" +
                "大文件会被截断并提示。",
            parameters = JSONObject().apply {
                put("type", "object")
                put("properties", JSONObject().apply {
                    put("path", JSONObject().apply {
                        put("type", "string")
                        put("description", "相对工作区的文件路径，如 src/main.ts")
                    })
                    put("offset", JSONObject().apply {
                        put("type", "integer")
                        put("description", "从第几行开始读（1 起，默认 1）")
                    })
                    put("limit", JSONObject().apply {
                        put("type", "integer")
                        put("description", "最多读多少行（默认 500）")
                    })
                })
                put("required", JSONArray(listOf("path")))
            },
        ),
        ToolSpec(
            name = "edit_file",
            description = "对文件做精确字符串替换（old_string → new_string）。" +
                "比 write_file 整写安全：不用重发整个文件，也不会漏掉未读部分。" +
                "old_string 必须在文件中唯一（除非 replace_all=true）。" +
                "改动前必须先 read_file 看过该文件。",
            parameters = JSONObject().apply {
                put("type", "object")
                put("properties", JSONObject().apply {
                    put("path", JSONObject().apply {
                        put("type", "string")
                        put("description", "相对工作区的文件路径")
                    })
                    put("old_string", JSONObject().apply {
                        put("type", "string")
                        put("description", "要替换的原文（必须与文件内容精确一致，含缩进）")
                    })
                    put("new_string", JSONObject().apply {
                        put("type", "string")
                        put("description", "替换后的新文本（空串 = 删除 old_string）")
                    })
                    put("replace_all", JSONObject().apply {
                        put("type", "boolean")
                        put("description", "替换所有出现（默认 false，此时 old_string 必须唯一）")
                    })
                })
                put("required", JSONArray(listOf("path", "old_string", "new_string")))
            },
        ),
        ToolSpec(
            name = "write_file",
            description = "把内容写入工作区内的文件（覆盖）。父目录会自动创建。" +
                "**无法撤销**，改动前先用 read_file 确认。" +
                "只修改文件的一部分时，优先用 edit_file。",
            parameters = JSONObject().apply {
                put("type", "object")
                put("properties", JSONObject().apply {
                    put("path", JSONObject().apply {
                        put("type", "string")
                        put("description", "相对工作区的文件路径")
                    })
                    put("content", JSONObject().apply {
                        put("type", "string")
                        put("description", "完整文件内容")
                    })
                })
                put("required", JSONArray(listOf("path", "content")))
            },
        ),
        ToolSpec(
            name = "list_dir",
            description = "列出工作区某目录下的文件与子目录。",
            parameters = JSONObject().apply {
                put("type", "object")
                put("properties", JSONObject().apply {
                    put("path", JSONObject().apply {
                        put("type", "string")
                        put("description", "相对工作区的目录路径，根目录用 \".\"")
                    })
                })
                put("required", JSONArray(listOf("path")))
            },
        ),
        ToolSpec(
            name = "search_in_files",
            description = "在工作区的文本文件里搜索（默认纯文本；regex=true 时按正则），" +
                "返回匹配的文件与行号。",
            parameters = JSONObject().apply {
                put("type", "object")
                put("properties", JSONObject().apply {
                    put("query", JSONObject().apply {
                        put("type", "string")
                        put("description", "要搜索的文本或正则表达式")
                    })
                    put("path", JSONObject().apply {
                        put("type", "string")
                        put("description", "限定搜索的子目录（默认整个工作区）")
                    })
                    put("regex", JSONObject().apply {
                        put("type", "boolean")
                        put("description", "按正则解释 query（默认 false 纯文本）")
                    })
                })
                put("required", JSONArray(listOf("query")))
            },
        ),
        ToolSpec(
            name = "glob",
            description = "按 glob 模式查找文件（如 \"*.kt\"、\"src/**/*Test.kt\"、" +
                "\"config?.json\"）。**比 list_dir 逐层翻快得多** —— 找文件一律先用它。" +
                "* 不跨目录，** 跨目录。",
            parameters = JSONObject().apply {
                put("type", "object")
                put("properties", JSONObject().apply {
                    put("pattern", JSONObject().apply {
                        put("type", "string")
                        put("description", "glob 模式，相对工作区")
                    })
                })
                put("required", JSONArray(listOf("pattern")))
            },
        ),
        ToolSpec(
            name = "todo",
            description = "更新当前会话的待办清单（整表替换）。" +
                "多步任务开始时建清单；开始做某项时把它设为 in_progress" +
                "（同一时间只应有一个），做完立即设为 completed。" +
                "过程中发现的新任务随时补进清单。",
            parameters = JSONObject().apply {
                put("type", "object")
                put("properties", JSONObject().apply {
                    put("todos", JSONObject().apply {
                        put("type", "array")
                        put(
                            "description",
                            "完整清单（覆盖式，不是增量）。每条含 content 与 status",
                        )
                        put("items", JSONObject().apply {
                            put("type", "object")
                            put("properties", JSONObject().apply {
                                put("content", JSONObject().apply {
                                    put("type", "string")
                                    put("description", "任务内容（祈使句）")
                                })
                                put("status", JSONObject().apply {
                                    put("type", "string")
                                    put(
                                        "description",
                                        "pending / in_progress / completed",
                                    )
                                })
                            })
                            put("required", JSONArray(listOf("content", "status")))
                        })
                    })
                })
                put("required", JSONArray(listOf("todos")))
            },
        ),
        ToolSpec(
            name = "run_command",
            description = "经 Termux 执行一条**受限命令**（只读/常见工具为主），" +
                "把 stdout/stderr 返回给模型。必须在工作区内、且命令前缀在白名单内" +
                "（ls/cat/grep/find/git/python3/node 等）。" +
                "不支持管道、;、&&、重定向、命令替换等 shell 语法（每次只能一条简单命令）。" +
                "若未安装 Termux 会明确返回错误。计算/改文件类请用 write_file 而非本工具。",
            parameters = JSONObject().apply {
                put("type", "object")
                put("properties", JSONObject().apply {
                    put("command", JSONObject().apply {
                        put("type", "string")
                        put("description", "要执行的命令（空格分隔的参数，不能含 shell 元字符）")
                    })
                    put("cwd", JSONObject().apply {
                        put("type", "string")
                        put("description", "工作目录（相对工作区，默认根目录 \".\"）")
                    })
                    put("timeout", JSONObject().apply {
                        put("type", "integer")
                        put("description", "最长等待秒数（默认 30，上限 120）")
                    })
                })
                put("required", JSONArray(listOf("command")))
            },
        ),
    )

    /** 工具执行结果（回填给模型）。 */
    data class ToolResult(val ok: Boolean, val content: String, val toolName: String) {
        companion object {
            fun of(name: String, text: String) = ToolResult(true, text, name)
            fun error(name: String, reason: String) = ToolResult(false, "错误：$reason", name)
        }
    }

    /**
     * 执行一次工具调用。
     *
     * @param root 工作区根目录（已由用户授权）
     * @param arguments OpenAI 格式的 JSON 字符串（模型生成）
     * @param context Android 上下文。**仅在 `run_command` 需要**（用来检测
     *   Termux 是否安装、构造并发送 intent）。本地文件类工具不依赖它，
     *   故默认 null —— [LocalAgentBackend] 注入带 context 的版本即可，
     *   [AgentLoop] 的默认 toolFn 传 null（不影响文件类工具）。
     * @param approval 敏感操作的**事中确认**闸门（[ApprovalCoordinator]）。
     *   仅在 `run_command` 需要：执行前请用户确认该条命令。
     *   默认 null 表示**不设门**（与改造前行为一致）—— 既保证既有调用点
     *   与全部单测零改动，又让生产由 [LocalAgentBackend] 注入真实实现。
     */
    fun execute(
        root: File,
        toolName: String,
        arguments: String,
        context: Context? = null,
        approval: ApprovalCoordinator? = null,
    ): ToolResult {
        val args = runCatching { JSONObject(arguments.ifBlank { "{}" }) }.getOrNull()
            ?: return ToolResult.error(toolName, "参数不是合法 JSON")
        return try {
            when (toolName) {
                "read_file" -> readFile(root, args)
                "edit_file" -> editFile(root, args)
                "write_file" -> writeFile(root, args)
                "list_dir" -> listDir(root, args)
                "search_in_files" -> searchInFiles(root, args)
                "glob" -> globFiles(root, args)
                "todo" -> updateTodos(args)
                "run_command" -> runCommandViaTermux(root, args, context, approval)
                else -> ToolResult.error(toolName, "未知工具：$toolName")
            }
        } catch (e: Exception) {
            // 工具执行异常不该终止整个 agent 循环 —— 把原因告诉模型，
            // 它通常能自行换一种做法
            Log.w(TAG, "工具 $toolName 执行失败：${e.message}")
            ToolResult.error(toolName, e.message ?: "执行失败")
        }
    }

    /** 解析并校验路径；失败返回错误结果。 */
    private fun safeFile(root: File, raw: String?, toolName: String): Pair<File?, ToolResult?> {
        if (raw == null) return null to ToolResult.error(toolName, "缺少 path 参数")
        return when (val r = WorkspacePath.resolve(raw)) {
            is WorkspacePath.Resolved.Rejected -> null to ToolResult.error(toolName, r.reason)
            is WorkspacePath.Resolved.Ok -> File(root, r.relative) to null
        }
    }

    // ── edit_file（L1）：读状态跟踪 ──

    /**
     * 「模型读过哪些文件」的内存记录：key = 文件绝对路径，value = 读时刻。
     *
     * ## 为什么 edit 前必须读过（吸收自 CLI FileEditTool 的 errorCode 6）
     *
     * 没读过的编辑是**盲改**：模型凭想象写 old_string，几乎必然「未找到」，
     * 浪费轮次；更糟的是偶尔猜中 —— 改了它没看过的上下文。
     * 强制先读，等于把「看清楚再改」变成机制而非提示词里的期望。
     *
     * ## 为什么不校验「文件在读完之后被改过」（CLI 的 errorCode 7）
     *
     * 那需要存「读时的内容指纹」并每次比对。手机上没有 linter/云同步这类
     * 并发修改源（单用户、单进程），比对只防「用户自己在文件管理器里改了」
     * —— 这种场景下 edit 失败后模型重读一次即可自救，不值得为此存全文快照。
     * （ponytail: 若将来出现并发修改问题，升级路径是存 mtime 而非内容。）
     *
     * ## 生命周期
     *
     * object 级（App 进程内）。进程重启后清空 —— 模型要重新 read 一次，
     * 这正是我们想要的行为（新会话应当重新确认现状）。
     */
    private val readTracker = HashMap<String, Long>()

    /** 记录一次成功的读（[readFile] 与 [editFile] 成功后调用）。 */
    private fun markRead(f: File) {
        readTracker[f.absolutePath] = System.currentTimeMillis()
    }

    /** 该文件是否被读过。 */
    internal fun hasRead(f: File): Boolean = f.absolutePath in readTracker

    /**
     * edit_file：精确字符串替换。
     *
     * 错误信息**面向模型自救**（吸收自 CLI FileEditTool 的文案设计）：
     * 每条错误都说清「下一步该怎么做」（提供更多上下文 / 设 replace_all /
     * 先 read_file），而不是只报失败 —— 模型据此能自己修正重试。
     */
    private fun editFile(root: File, args: JSONObject): ToolResult {
        val (f, err) = safeFile(root, args.optString("path").ifBlank { null }, "edit_file")
        if (err != null) return err
        val pathArg = args.optString("path")
        val oldStr = args.optString("old_string")
        val newStr = args.optString("new_string")
        val replaceAll = args.optBoolean("replace_all", false)

        if (!f!!.exists()) {
            return ToolResult.error(
                "edit_file",
                "文件不存在：$pathArg。要创建新文件请用 write_file。",
            )
        }
        if (f.isDirectory) return ToolResult.error("edit_file", "目标是目录")
        if (oldStr.isEmpty()) {
            return ToolResult.error(
                "edit_file",
                "old_string 不能为空。要覆盖整个文件请用 write_file。",
            )
        }
        if (oldStr == newStr) {
            return ToolResult.error("edit_file", "old_string 与 new_string 相同，无需修改")
        }
        if (!hasRead(f)) {
            return ToolResult.error(
                "edit_file",
                "必须先用 read_file 读过该文件才能编辑（防止盲改）。" +
                    "请先 read_file $pathArg，再基于实际内容构造 old_string。",
            )
        }

        // 大小上限与 write 同源：edit 是「读全文 → 替换 → 写回」，
        // 大文件会整个进内存，必须拦
        if (f.length() > MAX_WRITE_BYTES) {
            return ToolResult.error(
                "edit_file",
                "文件过大（${f.length() / 1024}KB，上限 ${MAX_WRITE_BYTES / 1024}KB）",
            )
        }

        // 与 CLI FileEditTool 同款：统一换行后再匹配，
        // 否则 CRLF 文件里用 \n 的 old_string 永远匹配不上
        val content = f.readText().replace("\r\n", "\n")
        val matches = countOccurrences(content, oldStr)
        if (matches == 0) {
            return ToolResult.error(
                "edit_file",
                "文件中未找到 old_string。请先 read_file 确认实际内容" +
                    "（注意缩进与换行），再重试。",
            )
        }
        if (matches > 1 && !replaceAll) {
            return ToolResult.error(
                "edit_file",
                "找到 $matches 处匹配，但 replace_all=false。" +
                    "要替换所有请设 replace_all=true；" +
                    "要只改一处请在 old_string 里包含更多上下文使其唯一。",
            )
        }

        val updated = if (replaceAll) content.replace(oldStr, newStr) else content.replaceFirst(oldStr, newStr)
        if (updated.toByteArray().size > MAX_WRITE_BYTES) {
            return ToolResult.error(
                "edit_file",
                "修改后文件过大（上限 ${MAX_WRITE_BYTES / 1024}KB）",
            )
        }
        f.writeText(updated)
        return ToolResult.of(
            "edit_file",
            "已修改 $pathArg（${if (replaceAll) "替换 $matches 处" else "替换 1 处"}）。" +
                "建议 read_file 确认改动效果。",
        )
    }

    /** 数子串出现次数（split 法：与 CLI `file.split(s).length - 1` 同义）。 */
    private fun countOccurrences(haystack: String, needle: String): Int =
        haystack.split(needle).size - 1

    private fun readFile(root: File, args: JSONObject): ToolResult {
        val (f, err) = safeFile(root, args.optString("path").ifBlank { null }, "read_file")
        if (err != null) return err
        if (!f!!.exists()) return ToolResult.error("read_file", "文件不存在：${args.optString("path")}")
        if (f.isDirectory) return ToolResult.error("read_file", "这是目录，请用 list_dir")
        // 记录读状态：edit_file 依赖它强制「先读后改」（见 readTracker 注释）
        markRead(f)

        val offset = args.optInt("offset", 1).coerceAtLeast(1)
        val limit = args.optInt("limit", 500).coerceIn(1, 5000)

        // ⚠ 必须**流式按行读**，不能 readLines() 读全文。
        //
        // 这里曾有个真实漏洞：原实现先 `if (f.length() > MAX_READ_BYTES)`
        // 只打了条日志、没有 return，随后仍 `readLines()` 读整个文件 ——
        // 一个 10MB 日志会一次性读入并 split 成几十万字符串 → **OOM 崩溃**。
        // 常量看着像保护，实际只用于记日志。
        //
        // 现改为：只读到「offset+limit 行」或「累计字节超上限」为止，
        // 内存占用与请求的行数成正比，与文件大小无关。
        // ⚠ 关于「共 N 行」：**刻意不数总行数**。
        //
        // 数完行数必须读完整个文件 —— 那正好抵消了 OOM 保护
        //（上一版修复就在这里踩坑：为了数行数而 `continue` 读完全文，
        //  使 MAX_READ_BYTES 永远触发不了，保护形同虚设）。
        //
        // 两个目标冲突时，**优先保护内存**：用户要的是「看这段内容」，
        // 不是「知道文件多长」。行数用「是否还有后续」的提示替代即可。
        val slice = ArrayList<String>(minOf(limit, 512))
        var bytesRead = 0
        var lineNo = 0
        var moreAfterSlice = false
        var truncatedByBytes = false

        f.bufferedReader().useLines { seq ->
            for (line in seq) {
                lineNo++
                if (lineNo < offset) continue
                if (slice.size >= limit) {
                    // 已取够行数：只需知道「后面还有」，不必继续读
                    moreAfterSlice = true
                    break
                }
                bytesRead += line.length
                if (bytesRead > MAX_READ_BYTES) {
                    truncatedByBytes = true
                    break
                }
                slice.add(line)
            }
        }

        if (slice.isEmpty()) {
            return ToolResult.of("read_file", "（无内容：起始行 ${offset} 超出文件范围）")
        }

        val sb = StringBuilder()
        sb.append("文件：${args.optString("path")}")
        when {
            // 如实说明「没读全」——否则模型以为拿到全文，
            // 据此改文件会丢掉后面的内容
            truncatedByBytes ->
                sb.append("（内容超过 ${MAX_READ_BYTES / 1024}KB，已截断，未读完整）")
            moreAfterSlice ->
                sb.append("（显示第 $offset-${offset - 1 + slice.size} 行，后面还有）")
            offset > 1 ->
                sb.append("（从第 $offset 行起，已到文件末尾）")
            else ->
                sb.append("（全文，共 ${slice.size} 行）")
        }
        sb.append('\n')
        slice.forEachIndexed { i, line ->
            val shown = if (line.length > MAX_LINE_LEN) line.take(MAX_LINE_LEN) + "…" else line
            sb.append(offset + i).append("\t").append(shown).append('\n')
        }
        if (truncatedByBytes || moreAfterSlice) {
            sb.append("…（可用 offset 继续读）")
        }
        return ToolResult.of("read_file", sb.toString())
    }

    private fun writeFile(root: File, args: JSONObject): ToolResult {
        val (f, err) = safeFile(root, args.optString("path").ifBlank { null }, "write_file")
        if (err != null) return err
        if (!args.has("content")) return ToolResult.error("write_file", "缺少 content 参数")
        val content = args.optString("content")
        if (content.toByteArray().size > MAX_WRITE_BYTES) {
            return ToolResult.error(
                "write_file",
                "内容过大（${content.toByteArray().size / 1024}KB，上限 ${MAX_WRITE_BYTES / 1024}KB）",
            )
        }
        if (f!!.isDirectory) return ToolResult.error("write_file", "目标是目录")

        f.parentFile?.mkdirs()
        f.writeText(content)
        return ToolResult.of(
            "write_file",
            "已写入 ${args.optString("path")}（${content.length} 字符）",
        )
    }

    private fun listDir(root: File, args: JSONObject): ToolResult {
        val (f, err) = safeFile(root, args.optString("path").ifBlank { "." }, "list_dir")
        if (err != null) return err
        if (!f!!.exists()) return ToolResult.error("list_dir", "目录不存在：${args.optString("path")}")
        if (!f.isDirectory) return ToolResult.error("list_dir", "不是目录，请用 read_file")

        val entries = f.listFiles()?.sortedWith(
            compareBy({ !it.isDirectory }, { it.name }),
        ) ?: return ToolResult.of("list_dir", "（空目录）")
        if (entries.isEmpty()) return ToolResult.of("list_dir", "（空目录）")

        val shown = entries.take(MAX_LIST_ENTRIES)
        val sb = StringBuilder()
        shown.forEach {
            sb.append(if (it.isDirectory) "[目录] " else "       ")
            sb.append(it.name)
            if (!it.isDirectory) sb.append("  (${it.length()} 字节)")
            sb.append('\n')
        }
        if (entries.size > MAX_LIST_ENTRIES) {
            sb.append("…（共 ${entries.size} 项，仅显示前 $MAX_LIST_ENTRIES 项）")
        }
        return ToolResult.of("list_dir", sb.toString())
    }

    private fun searchInFiles(root: File, args: JSONObject): ToolResult {
        val query = args.optString("query")
        if (query.isBlank()) return ToolResult.error("search_in_files", "缺少 query 参数")
        val sub = args.optString("path").ifBlank { "." }
        val (base, err) = safeFile(root, sub, "search_in_files")
        if (err != null) return err
        if (!base!!.exists()) return ToolResult.error("search_in_files", "路径不存在：$sub")

        // L3：支持正则（regex=true 时 query 按正则解释）。
        // 非法正则**立即报错**而非回退子串 —— 模型以为在搜正则，
        // 静默回退会让它拿到错误的「未找到」结论
        val useRegex = args.optBoolean("regex", false)
        val lineMatcher: (String) -> Boolean = if (useRegex) {
            val re = try {
                Regex(query)
            } catch (e: Exception) {
                return ToolResult.error(
                    "search_in_files",
                    "query 不是合法正则：${e.message}。修正正则，或去掉 regex 参数按纯文本搜。",
                )
            }
            { line -> re.containsMatchIn(line) }
        } else {
            { line -> line.contains(query) }
        }

        val hits = mutableListOf<String>()
        var scanned = 0
        var totalBytes = 0
        var truncated = false
        /** 是否因深度超限跳过了某些分支（与 truncated 区分：那个是提前结束）。 */
        var skippedDeep = false

        // 用 lateinit var 而非 val lambda：Kotlin 的 lambda 在初始化器里
        // 无法引用自身（递归），lateinit 允许「先声明后赋值」从而自引用
        lateinit var walk: (File, Int) -> Unit
        walk = fun(dir: File, depth: Int) {
            if (truncated) return
            // 深度上限：防深目录树把调用栈撑爆（StackOverflowError 是
            // Error 不是 Exception，外层 catch 拦不住，会崩掉 App）
            // 深度超限：**只跳过这一支**，不终止整个搜索。
            //
            // 曾经的写法是设 truncated=true 并 return —— 那会让「有一个深
            // 目录」导致整个搜索失效（用户看到「未找到」，而目标文件明明
            // 在浅层）。局部问题不该升级为全局失败。
            if (depth > MAX_SEARCH_DEPTH) {
                skippedDeep = true
                return
            }
            for (entry in dir.listFiles() ?: return) {
                if (truncated) return
                // 跳过明显不该进的目录：版本库、构建产物、依赖。
                // 不跳会让搜索在 node_modules 里卡几分钟
                if (entry.isDirectory) {
                    if (entry.name in SKIP_DIRS) continue
                    walk(entry, depth + 1)
                    continue
                }
                if (scanned++ >= MAX_SEARCH_FILES) {
                    truncated = true
                    return
                }
                // 跳过二进制/大文件：按扩展名粗筛 + 大小限制
                if (entry.length() > MAX_READ_BYTES) continue
                if (entry.extension.lowercase() in BINARY_EXT) continue
                // 累计读取量上限：单文件上限挡不住「文件多」的情况
                if (totalBytes + entry.length() > MAX_SEARCH_TOTAL_BYTES) {
                    truncated = true
                    return
                }
                totalBytes += entry.length().toInt()

                val lines = runCatching { entry.readLines() }.getOrNull() ?: continue
                lines.forEachIndexed { i, line ->
                    if (lineMatcher(line)) {
                        val rel = entry.relativeTo(root).path.replace('\\', '/')
                        hits.add("$rel:${i + 1}: ${line.trim().take(150)}")
                    }
                }
                if (hits.size >= MAX_SEARCH_HITS) {
                    truncated = true
                    return
                }
            }
        }
        walk(base, 0)

        if (hits.isEmpty()) {
            val suffix = if (skippedDeep) "（部分过深的目录被跳过）" else ""
            return ToolResult.of("search_in_files", "未找到「$query」$suffix")
        }
        val sb = StringBuilder()
        sb.append("找到 ${hits.size} 处")
        if (truncated) sb.append("（已达上限，可能还有更多）")
        if (skippedDeep) sb.append("（过深的目录已跳过）")
        sb.append("：\n")
        sb.append(hits.joinToString("\n"))
        return ToolResult.of("search_in_files", sb.toString())
    }

    /** 搜索时跳过的目录（版本库/依赖/构建产物）。 */
    private val SKIP_DIRS = setOf(
        ".git", "node_modules", "build", "dist", ".gradle", ".idea",
        "__pycache__", "target", "vendor", ".venv", "venv",
    )

    /** glob 结果上限。与 list_dir 同量级 —— 太多反而淹没模型。 */
    const val MAX_GLOB_RESULTS = 200

    /**
     * glob 工具实现：递归遍历工作区，匹配相对路径。
     *
     * 复用 [SKIP_DIRS]（与 search 同一语义：依赖/构建产物不是用户要找的）。
     * 深度与数量上限与 search 同源 —— glob 的遍历成本与 search 同量级。
     */
    private fun globFiles(root: File, args: JSONObject): ToolResult {
        val pattern = args.optString("pattern").trim()
        if (pattern.isEmpty()) return ToolResult.error("glob", "缺少 pattern 参数")

        val regex = try {
            GlobPattern.toRegex(pattern)
        } catch (e: Exception) {
            return ToolResult.error("glob", "模式非法：${e.message}")
        }

        val results = mutableListOf<String>()
        var truncated = false
        var scanned = 0

        // 与 searchInFiles 同款的递归（深度上限防栈溢出；truncated 提前结束）
        lateinit var walk: (File, Int) -> Unit
        walk = fun(dir: File, depth: Int) {
            if (truncated) return
            if (depth > MAX_SEARCH_DEPTH) return
            for (entry in dir.listFiles() ?: return) {
                if (truncated) return
                if (entry.isDirectory) {
                    if (entry.name in SKIP_DIRS) continue
                    walk(entry, depth + 1)
                    continue
                }
                if (scanned++ >= MAX_SEARCH_FILES) {
                    truncated = true
                    return
                }
                val rel = entry.relativeTo(root).path.replace('\\', '/')
                if (regex.matches(rel)) {
                    if (results.size >= MAX_GLOB_RESULTS) {
                        truncated = true
                        return
                    }
                    results.add(rel)
                }
            }
        }
        walk(root, 0)

        if (results.isEmpty()) {
            return ToolResult.of("glob", "没有匹配「$pattern」的文件。")
        }
        val sb = StringBuilder()
        sb.append("匹配 ${results.size} 个文件")
        if (truncated) sb.append("（已达上限，可能还有更多）")
        sb.append("：\n")
        sb.append(results.joinToString("\n"))
        return ToolResult.of("glob", sb.toString())
    }

    /** 明确跳过的二进制扩展名。 */
    private val BINARY_EXT = setOf(
        "png", "jpg", "jpeg", "gif", "webp", "ico", "pdf", "zip", "jar",
        "apk", "so", "dll", "exe", "bin", "mp3", "mp4", "ttf", "woff", "woff2",
    )

    // ── run_command（经 Termux 的受限命令执行）──

    /**
     * Termux 的包名。用于检测是否安装，以及构造 intent。
     *
     * ## 为什么不用 `com.termux.RUN_COMMAND`
     *
     * 那是 Termux 自定义 action 的字符串，历史上实际发布值就是
     * `"com.termux.RUN_COMMAND"`（见 Termux 官方 `TermuxConstants
     * .TERMUX_RUN_COMMAND_ACTION`）。直接写字符串常量，避免引入对
     * Termux 库的编译依赖（项目铁律：不引入新依赖）。
     */
    const val TERMUX_PACKAGE = "com.termux"

    /** Termux `RUN_COMMAND` intent 的 action（官方常量值）。 */
    const val TERMUX_RUN_COMMAND_ACTION = "com.termux.RUN_COMMAND"

    /** intent extra：要执行的命令（TermuxConstants.RUN_COMMAND_EXTRA_COMMAND）。 */
    const val EXTRA_COMMAND = "com.termux.RUN_COMMAND_COMMAND"

    /** intent extra：命令参数数组（TermuxConstants.RUN_COMMAND_EXTRA_ARGUMENTS）。 */
    const val EXTRA_ARGUMENTS = "com.termux.RUN_COMMAND_ARGUMENTS"

    /** intent extra：工作目录（TermuxConstants.RUN_COMMAND_EXTRA_WORKDIR）。 */
    const val EXTRA_WORKDIR = "com.termux.RUN_COMMAND_WORKDIR"

    /**
     * 允许的命令前缀（白名单）。
     *
     * ## 设计原则
     *
     * 只放**只读或受控**的工具：查看文件（ls/cat/head/tail/less）、
     * 搜索（grep/find）、版本控制只读（git 的 status/diff/log/show）、
     * 解释器（python3/node 用于跑只读脚本或 lint）。**明确不放**
     * rm/cp/mv/mkdir/dd/sudo/chmod/mount 等会改文件系统或提权的命令。
     *
     * 注意：白名单只校验「命令第一个 token」这个**前缀**。即便前缀是
     * 安全的，例如 `git`，我们也不允许 `git reset --hard` 这类破坏性
     * 子命令（见 [hasForbiddenSubcommand]）。命令整体还要过 [isSafeCommand]
     * 的元字符检查。
     */
    val ALLOWED_COMMAND_PREFIXES = setOf(
        "ls", "cat", "head", "tail", "less", "wc", "file",
        "grep", "egrep", "fgrep", "find", "diff", "sort", "uniq", "awk", "sed",
        "git", "python3", "python", "node", "jq", "xxd", "stat", "du", "tree",
    )

    /**
     * 各前缀下**禁止的破坏性子命令/选项**（片段匹配，命中即拒绝）。
     *
     * 例如 `git` 本身允许，但 `git reset --hard` / `git clean -fd` 会清改
     * 文件，故列入禁用片段。这样不必为 git 每个子命令单独开白名单，
     * 又挡住了明显危险的写法。
     */
    val FORBIDDEN_COMMAND_FRAGMENTS = setOf(
        "reset --hard", "clean -", "push --force", "checkout .",
        "rm -rf", "rm -r", " > /", " | ", " && ", " ; ", "$( ", "`",
        "--exec", "curl", "wget", "sudo", "su ", "dd ", "mkfs",
    )

    /** 命令等待结果的默认秒数与上限。 */
    const val DEFAULT_COMMAND_TIMEOUT_SEC = 30
    const val MAX_COMMAND_TIMEOUT_SEC = 120

    /** 轮询结果文件的时间间隔（毫秒）。 */
    private const val POLL_INTERVAL_MS = 300L

    /**
     * 命令是否安全（纯逻辑，可单测）。
     *
     * 判定顺序：
     * 1. 拆成 token（按空格）。空命令直接拒绝。
     * 2. **第一个 token 必须落在 [ALLOWED_COMMAND_PREFIXES]**。
     * 3. **整条命令不能含任何 shell 元字符/危险片段**
     *    （见 [FORBIDDEN_COMMAND_FRAGMENTS] 与 [SHELL_METACHARS]）。
     *    这一条就把管道 `|`、重定向 `>`、命令替换 `` ` ``、`$( )`、
     *    分号、&& 全部挡掉 —— 每次只能一条简单命令，杜绝串联破坏。
     *
     * @return 安全返回 null；不安全返回人类可读原因（面向模型自救）。
     */
    internal fun commandSafetyError(command: String): String? {
        val tokens = command.trim().split(Regex("\\s+"))
        if (tokens.isEmpty() || tokens[0].isEmpty()) {
            return "命令为空"
        }
        val head = tokens[0]
        // 只取文件名部分（防 `ls --` 之类写法；也防用户写绝对路径调用）
        val headBase = head.substringAfterLast('/')
        if (headBase !in ALLOWED_COMMAND_PREFIXES) {
            return "命令 「$head」 不在白名单内。只允许：${
                ALLOWED_COMMAND_PREFIXES.joinToString(" ")
            }"
        }
        // 危险片段（含 shell 元字符）一律拒绝
        for (frag in FORBIDDEN_COMMAND_FRAGMENTS) {
            if (command.contains(frag, ignoreCase = true)) {
                return "命令含不允许的语法/子命令：「$frag」被禁止（不支持管道、" +
                    "重定向、命令串联或破坏性子命令）"
            }
        }
        // 命令参数里的越界路径：`../` 向上逃逸工作区、以 `/` 开头的绝对路径
        // 会绕过"命令只能在工作区内"的承诺（cwd 只约束 Termux 的启动目录，
        // 不约束命令内部 cd）。白名单命令读这些路径时仍能越界，故在此一并拦
        if (command.contains("../") || Regex("""\s/[^ ]""").containsMatchIn(command)) {
            return "命令含越界路径（../ 或绝对路径），run_command 只能在当前工作区内操作"
        }
        for (ch in SHELL_METACHARS) {
            if (command.contains(ch)) {
                return "命令含 shell 元字符 「$ch」，run_command 不支持 shell 语法"
            }
        }
        return null
    }

    /** 单字符 shell 元字符（命中即拒绝，杜绝绕过片段匹配的边界情况）。 */
    private val SHELL_METACHARS = setOf('|', '&', ';', '`', '$', '>', '<', '(', ')', '{', '}', '\\')

    /**
     * 把命令构造为可执行的「写结果文件」脚本片段（纯逻辑）。
     *
     * Termux 的 RUN_COMMAND 是异步跨进程：我们用 `EXTRA_COMMAND` 直接执行
     * `命令 > 结果文件 2>&1` 把 stdout+stderr 落盘，本地再用 [File] 轮询
     * 读该文件。这里负责产出最终要交给 Termux 的整条命令字符串。
     *
     * 返回的命令形如：`cd '<workdir>' && <userCmd> > '<resultFile>' 2>&1`。
     * 注意：<userCmd> 来自白名单校验后的内容，**不会**被再次经 shell 解释
     * 新增危险结构 —— 校验已禁止所有元字符，这里只是包一层落盘。
     *
     * @param userCommand 已校验安全的命令
     * @param workdir 已校验落在工作区内的绝对目录
     * @param resultFile 结果输出文件（绝对路径）
     */
    internal fun buildTermuxCommand(
        userCommand: String,
        workdir: File,
        resultFile: File,
    ): String =
        "cd ${shellQuote(workdir.absolutePath)} && " +
            "$userCommand > ${shellQuote(resultFile.absolutePath)} 2>&1"

    /** 给 shell 参数加单引号（转义已有单引号）。仅用于**我们自己**拼的路径。 */
    private fun shellQuote(s: String): String = "'" + s.replace("'", "'\\''") + "'"

    /**
     * 经 Termux 执行命令并读回结果。
     *
     * ## 流程
     *
     * 1. 校验安全（[commandSafetyError]）；不通过直接返回可读错误。
     * 2. 校验工作目录落在 [WorkspacePath] 内（复用 [safeFile] 的解析，
     *    绝不绕过）；不存在则回落到工作区根。
     * 3. 检测 Termux 是否安装；未安装返回「未安装 Termux，请先安装」。
     * 4. 用 [buildTermuxCommand] 构造落盘命令，经 RUN_COMMAND intent
     *    （`FLAG_ACTIVITY_NEW_TASK`）调起 Termux 执行。
     * 5. 本地轮询结果文件（带超时），读到即返回其内容（截断防 OOM）。
     *
     * ## 为什么不用内嵌 shell
     *
     * 整个链路里没有我们自己的 shell 解释器：命令由 Termux 执行，
     * 我们只负责「拼一条已校验安全的命令字符串 + 读结果文件」。
     */
    private fun runCommandViaTermux(
        root: File,
        args: JSONObject,
        context: Context?,
        approval: ApprovalCoordinator?,
    ): ToolResult {
        val command = args.optString("command").trim()
        if (command.isEmpty()) return ToolResult.error("run_command", "缺少 command 参数")

        // 1. 安全白名单校验
        commandSafetyError(command)?.let { return ToolResult.error("run_command", it) }

        // 1b. 事中确认门（吸收自 termux-mcp approval.py）：
        //     白名单只保证「命令不是明显危险的」，但不保证「这条命令是用户
        //     此刻想要的」。对白名单内的命令再做一次**事中确认**，批准带 TTL，
        //     同一命令在有效期内不重复打扰。approval 为 null 时不设门。
        if (approval != null && !approval.request(command)) {
            return ToolResult.error(
                "run_command",
                "用户未批准执行该命令（或确认超时）。不要重复尝试同一命令，" +
                    "可改用其他方式或询问用户。命令：$command",
            )
        }

        // 2. 工作目录必须落在工作区内（复用 WorkspacePath 校验，绝不绕过）
        val cwdRaw = args.optString("cwd").ifBlank { "." }
        val (cwdFile, cwdErr) = safeFile(root, cwdRaw, "run_command")
        if (cwdErr != null) return cwdErr
        val workdir = if (cwdFile!!.exists() && cwdFile.isDirectory) cwdFile else root

        // 3. timeout 约束
        val timeoutSec = args.optInt("timeout", DEFAULT_COMMAND_TIMEOUT_SEC)
            .coerceIn(1, MAX_COMMAND_TIMEOUT_SEC)

        // 4. 检测 Termux
        if (context == null || !isTermuxInstalled(context)) {
            return ToolResult.error("run_command", "未安装 Termux，请先安装")
        }

        // 5. 结果文件放在工作区内（与 cwd 同级，避免写工作区外）
        val resultFile = File(workdir, ".termux_run_result.tmp")
        val termuxCmd = buildTermuxCommand(command, workdir, resultFile)

        val intent = Intent(TERMUX_RUN_COMMAND_ACTION).apply {
            setPackage(TERMUX_PACKAGE)
            // 直接把整条「落盘命令」交给 EXTRA_COMMAND，Termux 会用 sh -c 执行
            putExtra(EXTRA_COMMAND, termuxCmd)
            putExtra(EXTRA_WORKDIR, workdir.absolutePath)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return try {
            context.startActivity(intent)
            readResultFile(resultFile, timeoutSec)
        } catch (e: Exception) {
            // 例如 Termux 装了但 activity 无法调起（权限/版本），返回可读错误
            ToolResult.error("run_command", "无法调起 Termux：${e.message}")
        }
    }

    /** Termux 是否已安装（查 activity 解析，不依赖抛异常）。 */
    private fun isTermuxInstalled(context: Context): Boolean {
        val pm = context.packageManager
        val intent = Intent(TERMUX_RUN_COMMAND_ACTION).setPackage(TERMUX_PACKAGE)
        val resolved = runCatching {
            pm.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
        }.getOrNull()
        if (!resolved.isNullOrEmpty()) return true
        // 兜底：用 launch intent 探测包是否存在
        return runCatching {
            pm.getLaunchIntentForPackage(TERMUX_PACKAGE) != null
        }.getOrDefault(false)
    }

    /**
     * 轮询读取 Termux 写回的结果文件（带总超时）。
     *
     * 截断上限复用 [MAX_READ_BYTES]，防止超长输出 OOM。Termux 是异步执行，
     * 我们轮询直到文件出现并稳定（大小两次一致视为写完），或超时。
     */
    private fun readResultFile(resultFile: File, timeoutSec: Int): ToolResult {
        val deadline = System.currentTimeMillis() + timeoutSec * 1000L
        var lastSize = -1L
        while (System.currentTimeMillis() < deadline) {
            if (resultFile.exists()) {
                val size = resultFile.length()
                if (size == lastSize && size >= 0) {
                    // 大小稳定：认为执行完毕
                    val text = runCatching {
                        resultFile.readText()
                    }.getOrNull() ?: ""
                    resultFile.delete()
                    val truncated = text.toByteArray().size > MAX_READ_BYTES
                    val shown = if (truncated) {
                        text.toByteArray().sliceArray(0 until MAX_READ_BYTES)
                            .toString(Charsets.UTF_8) + "\n…（输出过大已截断）"
                    } else text
                    return ToolResult.of(
                        "run_command",
                        "命令输出（经 Termux，工作目录 ${resultFile.parentFile?.absolutePath ?: ""}）：\n$shown",
                    )
                }
                lastSize = size
            }
            Thread.sleep(POLL_INTERVAL_MS)
        }
        // 超时：清理可能的残留文件，避免下次误读旧结果
        resultFile.delete()
        return ToolResult.error(
            "run_command",
            "命令执行超时（${timeoutSec}s）。可能 Termux 未在后台运行或命令卡住。",
        )
    }
}
