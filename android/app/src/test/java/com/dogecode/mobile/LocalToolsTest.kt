package com.dogecode.mobile

import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * 本地模式工具集的测试（用真实临时目录，非 mock）。
 *
 * 为什么用真实文件：这些工具的**全部价值**就是与文件系统交互，
 * mock 掉文件系统等于没测。用 JUnit 的 TemporaryFolder 等价物
 * （手写临时目录）可真实覆盖「父目录不存在时写入」「大文件截断」
 * 「越界被拒」等路径。
 *
 * 安全边界（越界）的用例**必须存在**：模型生成的路径是不可信输入。
 */
class LocalToolsTest {

    private lateinit var root: File

    @Before
    fun setUp() {
        root = File.createTempFile("ws-test", "").apply {
            delete()
            mkdirs()
        }
    }

    @After
    fun tearDown() {
        root.deleteRecursively()
    }

    private fun write(rel: String, text: String) {
        File(root, rel).apply {
            parentFile?.mkdirs()
            writeText(text)
        }
    }

    private fun exec(tool: String, json: String) = LocalTools.execute(root, tool, json)

    // ── specs ──

    @Test
    fun `暴露八个工具`() {
        val names = LocalTools.specs().map { it.name }.toSet()
        assertEquals(
            setOf(
                "read_file", "edit_file", "write_file", "list_dir",
                "search_in_files", "glob", "todo", "run_command",
            ),
            names,
        )
    }

    @Test
    fun `提供经 Termux 的受限 run_command 工具`() {
        // 现在命令经 Termux 跑白名单内命令，run_command 必须存在；
        // 但不能提供「无限制 shell」（bash/exec/shell 仍禁止 —— 那是绕过白名单）
        val names = LocalTools.specs().map { it.name }
        assertTrue("run_command 应存在", "run_command" in names)
        assertFalse("不应提供无限制 shell 工具", names.any { it in setOf("bash", "exec", "shell") })
    }

    @Test
    fun `run_command 必填 command 参数`() {
        val spec = LocalTools.specs().first { it.name == "run_command" }
        val required = spec.parameters.getJSONArray("required")
        assertTrue("run_command 必须必填 command", (0 until required.length()).any { required.getString(it) == "command" })
    }

    @Test
    fun `每个工具都有可读描述与必填参数`() {
        LocalTools.specs().forEach { s ->
            assertTrue("${s.name} 缺描述", s.description.isNotBlank())
            assertTrue("${s.name} 缺 parameters", s.parameters.has("required"))
        }
    }

    // ── read_file ──

    @Test
    fun `读取文件带行号`() {
        write("a.txt", "第一行\n第二行\n第三行")
        val r = exec("read_file", """{"path":"a.txt"}""")
        assertTrue(r.ok)
        assertTrue("应含行号 1", r.content.contains("1\t第一行"))
        assertTrue("应含行号 3", r.content.contains("3\t第三行"))
    }

    @Test
    fun `读取不存在的文件返回可读错误`() {
        val r = exec("read_file", """{"path":"nope.txt"}""")
        assertFalse(r.ok)
        assertTrue("应说明文件不存在", r.content.contains("不存在"))
    }

    @Test
    fun `读取目录时提示改用 list_dir`() {
        File(root, "sub").mkdirs()
        val r = exec("read_file", """{"path":"sub"}""")
        assertFalse(r.ok)
        assertTrue("应引导用 list_dir", r.content.contains("list_dir"))
    }

    @Test
    fun `offset 与 limit 生效`() {
        write("a.txt", (1..100).joinToString("\n") { "L$it" })
        val r = exec("read_file", """{"path":"a.txt","offset":10,"limit":5}""")
        assertTrue(r.content.contains("10\tL10"))
        assertTrue(r.content.contains("14\tL14"))
        assertFalse("不该含第 15 行", r.content.contains("15\tL15"))
    }

    @Test
    fun `未读完时提示后面还有`() {
        // 行为变更：**不再数总行数**（数完必须读完全文，会抵消 OOM 保护）。
        // 改为提示「后面还有 + 可用 offset 继续」—— 同样能告知「没读全」，
        // 且内存占用与文件大小无关。
        write("a.txt", (1..50).joinToString("\n") { "L$it" })
        val r = exec("read_file", """{"path":"a.txt","limit":10}""")
        assertTrue("应说明只显示了部分", r.content.contains("后面还有"))
        assertTrue("应引导继续读", r.content.contains("offset"))
    }

    @Test
    fun `读到末尾时说明已到文件末尾`() {
        write("a.txt", (1..5).joinToString("\n") { "L$it" })
        val r = exec("read_file", """{"path":"a.txt","offset":3}""")
        assertTrue("应说明已到末尾", r.content.contains("末尾"))
    }

    @Test
    fun `完整读小文件时说明是全文`() {
        write("a.txt", "a\nb\nc")
        val r = exec("read_file", """{"path":"a.txt"}""")
        assertTrue("应标明是全文", r.content.contains("全文"))
    }

    @Test
    fun `超大文件读取受控且不 OOM（回归：曾只记日志不截断）`() {
        // 审核发现的真实漏洞：原实现只对 >256KB 打了个日志、没有 return，
        // 随后仍 readLines() 读全文 —— 3MB 文件会读入全部内容并 split，
        // 在手机上 OOM。
        //
        // 两层保护（都对）：
        // · limit（默认 500 行）—— 主要限制，先触发
        // · MAX_READ_BYTES（256KB）—— 兜底，防「行数少但每行极长」
        // 本用例验证**主要意图**：读完的字节量受控，与文件大小无关。
        val big = File(root, "big.log")
        big.bufferedWriter().use { w ->
            repeat(30_000) { w.write("这是一行较长的日志内容，用于把文件撑到 3MB 左右。\n") }
        }
        assertTrue("测试文件应远大于读取上限", big.length() > LocalTools.MAX_READ_BYTES * 5)

        val r = exec("read_file", """{"path":"big.log"}""")
        assertTrue("不该崩，应正常返回", r.ok)
        assertTrue("应告知未读全", r.content.contains("后面还有") || r.content.contains("截断"))
        assertTrue(
            "返回内容远小于文件（证明没读全文）",
            r.content.length < big.length() / 10,
        )
    }

    @Test
    fun `行数少但单行极长时由字节上限兜底`() {
        // 这是 MAX_READ_BYTES 存在的理由：3 行 × 各 200KB
        // 此时 limit=500 行不会触发，只能靠字节上限拦住
        val f = File(root, "longline.txt")
        f.bufferedWriter().use { w ->
            repeat(3) { w.write("x".repeat(200_000)); w.write("\n") }
        }
        val r = exec("read_file", """{"path":"longline.txt"}""")
        assertTrue("应正常返回", r.ok)
        assertTrue("应由字节上限截断", r.content.contains("截断"))
        assertTrue("内容应受控", r.content.length < LocalTools.MAX_READ_BYTES)
    }

    // ── write_file ──

    @Test
    fun `写入文件`() {
        val r = exec("write_file", """{"path":"new/a.txt","content":"你好"}""")
        assertTrue(r.ok)
        assertEquals("你好", File(root, "new/a.txt").readText())
    }

    @Test
    fun `父目录自动创建`() {
        exec("write_file", """{"path":"deep/nested/x.txt","content":"v"}""")
        assertTrue(File(root, "deep/nested/x.txt").exists())
    }

    @Test
    fun `缺 content 参数返回错误`() {
        val r = exec("write_file", """{"path":"a.txt"}""")
        assertFalse(r.ok)
        assertTrue(r.content.contains("content"))
    }

    @Test
    fun `覆盖已有文件`() {
        write("a.txt", "旧")
        exec("write_file", """{"path":"a.txt","content":"新"}""")
        assertEquals("新", File(root, "a.txt").readText())
    }

    // ── list_dir ──

    @Test
    fun `列目录含子目录标记`() {
        File(root, "sub").mkdirs()
        write("a.txt", "x")
        val r = exec("list_dir", """{"path":"."}""")
        assertTrue(r.content.contains("[目录] sub"))
        assertTrue(r.content.contains("a.txt"))
    }

    @Test
    fun `空目录给出明确提示`() {
        val r = exec("list_dir", """{"path":"."}""")
        assertTrue(r.content.contains("空目录"))
    }

    @Test
    fun `列不存在的目录返回错误`() {
        assertFalse(exec("list_dir", """{"path":"nope"}""").ok)
    }

    @Test
    fun `对文件调用 list_dir 时提示改用 read_file`() {
        write("a.txt", "x")
        val r = exec("list_dir", """{"path":"a.txt"}""")
        assertFalse(r.ok)
        assertTrue(r.content.contains("read_file"))
    }

    // ── search_in_files ──

    @Test
    fun `搜索返回文件与行号`() {
        write("src/a.ts", "line1\nconst target = 1\nline3")
        val r = exec("search_in_files", """{"query":"target"}""")
        assertTrue(r.ok)
        assertTrue("应含路径", r.content.contains("src/a.ts"))
        assertTrue("应含行号 2", r.content.contains(":2:"))
    }

    @Test
    fun `无匹配给出明确提示`() {
        write("a.txt", "abc")
        val r = exec("search_in_files", """{"query":"zzz"}""")
        assertTrue(r.ok)
        assertTrue(r.content.contains("未找到"))
    }

    @Test
    fun `缺 query 返回错误`() {
        assertFalse(exec("search_in_files", """{"path":"."}""").ok)
    }

    @Test
    fun `跳过 node_modules 等依赖目录`() {
        // 不跳会让搜索在依赖里卡几分钟
        write("node_modules/pkg/index.js", "needle here")
        write("src/a.txt", "needle here")
        val r = exec("search_in_files", """{"query":"needle"}""")
        assertFalse("不该搜到依赖里的", r.content.contains("node_modules"))
        assertTrue("该搜到源码里的", r.content.contains("src/a.txt"))
    }

    @Test
    fun `超过深度上限的目录不再深入（可证伪的行为断言）`() {
        // 审核发现：递归 walk() 随层数消耗调用栈。StackOverflowError 是
        // Error 不是 Exception，外层 catch 拦不住 → 崩掉 App。
        //
        // ⚠ 测试设计教训：第一版只断言「不崩」——但 JVM 默认栈下 52 层
        // 不会溢出，**去掉深度上限该用例照样通过**（变异测试未捕获）。
        // 改为断言**可观察的行为**：超过上限处的文件不该被搜到。
        val deep = File(root, "deep")
        var cur = deep
        // 造到刚好超过上限
        repeat(LocalTools.MAX_SEARCH_DEPTH + 5) { cur = File(cur, "d$it") }
        cur.mkdirs()
        File(cur, "toodeep.txt").writeText("needle")
        // 上限之内的位置放一个可搜到的
        val shallow = File(root, "deep").apply { mkdirs() }
        File(shallow, "ok.txt").writeText("needle")

        val r = exec("search_in_files", """{"query":"needle"}""")
        assertTrue("不该崩", r.ok)
        assertTrue("上限内的文件应被搜到", r.content.contains("ok.txt"))
        assertFalse(
            "超深目录应被跳过（若去掉深度上限，此断言失败）",
            r.content.contains("toodeep.txt"),
        )
    }

    @Test
    fun `累计读取量有上限（回归：只限制单文件大小）`() {
        // 审核发现：单文件上限挡不住「文件多」——2000 个 200KB 文件
        // 累计 400MB 读取量同样 OOM。此处造多个中等文件验证总量受控。
        repeat(200) { i ->
            File(root, "many").apply { mkdirs() }
            File(root, "many/f$i.txt").writeText("padding".repeat(2000)) // 每个 14KB
        }
        val r = exec("search_in_files", """{"query":"needle-not-exist"}""")
        assertTrue("应正常返回而非 OOM", r.ok)
    }

    @Test
    fun `限定子目录搜索`() {
        write("a/x.txt", "needle")
        write("b/y.txt", "needle")
        val r = exec("search_in_files", """{"query":"needle","path":"a"}""")
        assertTrue(r.content.contains("a/x.txt"))
        assertFalse("不该含 b 目录的", r.content.contains("b/y.txt"))
    }

    // ── 安全边界（最重要）──

    @Test
    fun `读取越界路径被拒绝`() {
        val r = exec("read_file", """{"path":"../../etc/passwd"}""")
        assertFalse("越界必须拒绝", r.ok)
        assertTrue(r.content.contains("工作区"))
    }

    @Test
    fun `写入越界路径被拒绝且不落盘`() {
        // 用**唯一文件名**：固定名字会被上一次运行（尤其变异测试注入时
        // 真的写成功的那些次）残留在临时目录里，导致本用例误判。
        // 这项是「不落盘」的断言，必须保证探测的是本次写入的结果。
        val name = "evil-${System.nanoTime()}.txt"
        val target = File(root.parentFile, name)
        try {
            val r = exec("write_file", """{"path":"../$name","content":"x"}""")
            assertFalse("越界必须拒绝", r.ok)
            assertFalse("不能写到工作区外", target.exists())
        } finally {
            target.delete()
        }
    }

    @Test
    fun `绝对路径被拒绝`() {
        assertFalse(exec("read_file", """{"path":"/etc/passwd"}""").ok)
        assertFalse(exec("list_dir", """{"path":"/"}""").ok)
    }

    @Test
    fun `搜索的越界路径被拒绝`() {
        assertFalse(exec("search_in_files", """{"query":"x","path":"../.."}""").ok)
    }

    // ── 通用 ──

    @Test
    fun `未知工具返回错误而非抛异常`() {
        val r = exec("rm_rf", """{"path":"."}""")
        assertFalse(r.ok)
        assertTrue(r.content.contains("未知工具"))
    }

    @Test
    fun `非法 JSON 参数返回错误而非抛异常`() {
        val r = LocalTools.execute(root, "read_file", "{bad json")
        assertFalse(r.ok)
        assertTrue(r.content.contains("JSON"))
    }

    @Test
    fun `空参数按空对象处理`() {
        // 模型有时传空 arguments，不该崩
        val r = LocalTools.execute(root, "list_dir", "")
        assertTrue("空参数应能执行（path 默认 .）", r.ok)
    }

    @Test
    fun `缺 path 参数时明确报错`() {
        val r = LocalTools.execute(root, "read_file", JSONObject().toString())
        assertFalse(r.ok)
        assertTrue(r.content.contains("path"))
    }

    // ── edit_file（L1）──

    /** 先读再编辑的流程（每个 edit 用例的公共前置）。 */
    private fun readFileFirst(rel: String) {
        exec("read_file", """{"path":"$rel"}""")
    }

    @Test
    fun `edit 成功替换唯一匹配`() {
        write("a.txt", "hello world\nsecond line")
        readFileFirst("a.txt")
        val r = exec(
            "edit_file",
            """{"path":"a.txt","old_string":"hello world","new_string":"你好世界"}""",
        )
        assertTrue(r.ok)
        assertEquals("你好世界\nsecond line", File(root, "a.txt").readText())
    }

    @Test
    fun `未读过的文件拒绝编辑（防盲改）`() {
        // 这是 edit_file 的核心安全机制：没有它，模型可以凭想象改文件
        write("a.txt", "content")
        val r = exec(
            "edit_file",
            """{"path":"a.txt","old_string":"content","new_string":"x"}""",
        )
        assertFalse("未读过必须拒绝", r.ok)
        assertTrue("错误信息应指引模型先 read_file", r.content.contains("read_file"))
        // 文件未被改动
        assertEquals("content", File(root, "a.txt").readText())
    }

    @Test
    fun `读过的文件可以编辑`() {
        write("a.txt", "content")
        readFileFirst("a.txt")
        val r = exec(
            "edit_file",
            """{"path":"a.txt","old_string":"content","new_string":"changed"}""",
        )
        assertTrue(r.ok)
        assertEquals("changed", File(root, "a.txt").readText())
    }

    @Test
    fun `多匹配无 replace_all 时拒绝并给出自救指引`() {
        write("a.txt", "x foo y\nz foo w")
        readFileFirst("a.txt")
        val r = exec(
            "edit_file",
            """{"path":"a.txt","old_string":"foo","new_string":"bar"}""",
        )
        assertFalse(r.ok)
        // 错误信息必须两条路都指出来（吸收自 CLI FileEditTool 的文案）
        assertTrue("应提示 replace_all", r.content.contains("replace_all"))
        assertTrue("应提示加上下文", r.content.contains("上下文"))
        assertEquals("拒绝时文件不能被改", "x foo y\nz foo w", File(root, "a.txt").readText())
    }

    @Test
    fun `多匹配且 replace_all=true 全部替换`() {
        write("a.txt", "x foo y\nz foo w")
        readFileFirst("a.txt")
        val r = exec(
            "edit_file",
            """{"path":"a.txt","old_string":"foo","new_string":"bar","replace_all":true}""",
        )
        assertTrue(r.ok)
        assertEquals("x bar y\nz bar w", File(root, "a.txt").readText())
        assertTrue("应报告替换了 2 处", r.content.contains("2 处"))
    }

    @Test
    fun `old_string 不存在时报错并指引重读`() {
        write("a.txt", "actual content")
        readFileFirst("a.txt")
        val r = exec(
            "edit_file",
            """{"path":"a.txt","old_string":"imagined content","new_string":"x"}""",
        )
        assertFalse(r.ok)
        assertTrue("应指引模型 read_file 确认", r.content.contains("read_file"))
    }

    @Test
    fun `空 new_string 等于删除 old_string`() {
        write("a.txt", "keep\ndelete me\nkeep2")
        readFileFirst("a.txt")
        val r = exec(
            "edit_file",
            """{"path":"a.txt","old_string":"delete me\n","new_string":""}""",
        )
        assertTrue(r.ok)
        assertEquals("keep\nkeep2", File(root, "a.txt").readText())
    }

    @Test
    fun `old 与 new 相同时拒绝（无意义修改）`() {
        write("a.txt", "same")
        readFileFirst("a.txt")
        val r = exec(
            "edit_file",
            """{"path":"a.txt","old_string":"same","new_string":"same"}""",
        )
        assertFalse(r.ok)
    }

    @Test
    fun `空 old_string 拒绝并指引用 write_file`() {
        write("a.txt", "content")
        readFileFirst("a.txt")
        val r = exec(
            "edit_file",
            """{"path":"a.txt","old_string":"","new_string":"x"}""",
        )
        assertFalse(r.ok)
        assertTrue("应指引 write_file", r.content.contains("write_file"))
    }

    @Test
    fun `CRLF 文件用 LF 的 old_string 也能匹配`() {
        // Windows 换行的文件，模型按 LF 写 old_string —— 必须先统一再匹配，
        // 否则「明明看得见就是匹配不上」，模型会反复重试浪费轮次
        File(root, "crlf.txt").writeText("line one\r\nline two\r\n")
        readFileFirst("crlf.txt")
        val r = exec(
            "edit_file",
            """{"path":"crlf.txt","old_string":"line one\nline two","new_string":"merged"}""",
        )
        assertTrue("CRLF 归一化后应能匹配: ${r.content}", r.ok)
    }

    @Test
    fun `不存在的文件拒绝编辑并指引 write_file`() {
        val r = exec(
            "edit_file",
            """{"path":"nope.txt","old_string":"a","new_string":"b"}""",
        )
        assertFalse(r.ok)
        assertTrue("应指引 write_file 创建", r.content.contains("write_file"))
    }

    @Test
    fun `编辑后文件保持可再次编辑（读状态保留）`() {
        write("a.txt", "v1")
        readFileFirst("a.txt")
        exec("edit_file", """{"path":"a.txt","old_string":"v1","new_string":"v2"}""")
        // 第二次编辑不需要再 read（读状态没有被 edit 清掉）
        val r2 = exec(
            "edit_file",
            """{"path":"a.txt","old_string":"v2","new_string":"v3"}""",
        )
        assertTrue("连续编辑不应要求重新 read", r2.ok)
        assertEquals("v3", File(root, "a.txt").readText())
    }

    @Test
    fun `edit 的越界路径被拒绝`() {
        val r = exec(
            "edit_file",
            """{"path":"../outside.txt","old_string":"a","new_string":"b"}""",
        )
        assertFalse(r.ok)
    }

    @Test
    fun `系统提示词包含 edit_file 且指引优先使用`() {
        // 双向契约：specs() 加了工具，SystemPrompt 必须同步 ——
        // 否则模型不知道有它（等于没加）
        val prompt = SystemPrompt.build("test")
        assertTrue("提示词应列 edit_file", prompt.contains("edit_file"))
        assertTrue("提示词应指引优先 edit", prompt.contains("优先用 edit_file"))
    }

    @Test
    fun `系统提示词同步声明 run_command 能力`() {
        // specs() 加了 run_command，提示词必须也出现，否则模型不知道能用
        val prompt = SystemPrompt.build("test")
        SystemPrompt.REQUIRED_CAPABILITIES.forEach { cap ->
            assertTrue("提示词应声明能力：$cap", prompt.contains(cap))
        }
    }

    // ── run_command 安全白名单（纯逻辑，可单测）──

    @Test
    fun `白名单命令通过安全校验`() {
        val ok = listOf(
            "ls -la",
            "cat src/main.ts",
            "grep -rn TODO .",
            "find . -name '*.kt'",
            "git status",
            "git diff HEAD",
            "python3 -c 'print(1)'",
            "node -e 'console.log(2)'",
        )
        ok.forEach { cmd ->
            assertNull("白名单命令应通过：$cmd", LocalTools.commandSafetyError(cmd))
        }
    }

    @Test
    fun `非白名单命令被拒绝`() {
        val bad = listOf("rm -rf /", "sudo ls", "cp a b", "mkdir x", "curl http://x", "echo hi")
        bad.forEach { cmd ->
            assertNotNull("非白名单命令应被拒：$cmd", LocalTools.commandSafetyError(cmd))
        }
    }

    @Test
    fun `shell 元字符与串联被拒绝`() {
        val bad = listOf(
            "ls | cat",        // 管道
            "ls && echo x",     // 串联
            "ls ; rm x",        // 分号
            "ls > out.txt",     // 重定向
            "echo `whoami`",    // 命令替换
            "$(ls)",            // 命令替换
        )
        bad.forEach { cmd ->
            assertNotNull("含 shell 语法应被拒：$cmd", LocalTools.commandSafetyError(cmd))
        }
    }

    @Test
    fun `git 破坏性子命令被拒绝`() {
        assertNotNull(
            "git reset --hard 应被拒",
            LocalTools.commandSafetyError("git reset --hard HEAD"),
        )
        assertNotNull(
            "git clean 应被拒",
            LocalTools.commandSafetyError("git clean -fd"),
        )
    }

    @Test
    fun `构造 Termux 命令会落盘到结果文件`() {
        val workdir = File("/workspace")
        val result = File(workdir, ".termux_run_result.tmp")
        val cmd = LocalTools.buildTermuxCommand("ls -la", workdir, result)
        assertTrue("应包含 cd 到工作区", cmd.startsWith("cd '/workspace'"))
        assertTrue("应包含原命令", cmd.contains("ls -la"))
        assertTrue("应重定向到结果文件", cmd.endsWith("> '/workspace/.termux_run_result.tmp' 2>&1"))
    }
}
