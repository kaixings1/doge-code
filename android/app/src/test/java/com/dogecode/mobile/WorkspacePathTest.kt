package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 工作区路径安全解析测试 —— **这是安全边界，不是功能测试**。
 *
 * 本地模式下模型可主动请求读写文件（路径由它生成）。若此处判据有洞，
 * 一个被注入的提示词就能读到工作区外的凭证文件。
 * 而这类错误**不会报错、只会静默放行**，故必须穷举。
 *
 * 变异验证：把 resolve 里 `out.isEmpty()` 的 `..` 分支改成 `continue`
 * （静默忽略越界），「上一级越界被拒绝」用例失败。
 */
class WorkspacePathTest {

    private fun ok(raw: String): String {
        val r = WorkspacePath.resolve(raw)
        assertTrue("期望被接受，实际拒绝：$raw（${(r as? WorkspacePath.Resolved.Rejected)?.reason}）", r is WorkspacePath.Resolved.Ok)
        return (r as WorkspacePath.Resolved.Ok).relative
    }

    private fun rejected(raw: String): String {
        val r = WorkspacePath.resolve(raw)
        assertTrue("期望被拒绝，实际接受：$raw", r is WorkspacePath.Resolved.Rejected)
        return (r as WorkspacePath.Resolved.Rejected).reason
    }

    // ── 正常路径 ──

    @Test
    fun `简单相对路径原样返回`() {
        assertEquals("src/a.ts", ok("src/a.ts"))
    }

    @Test
    fun `单个文件`() {
        assertEquals("README.md", ok("README.md"))
    }

    @Test
    fun `多级目录`() {
        assertEquals("a/b/c/d.txt", ok("a/b/c/d.txt"))
    }

    @Test
    fun `反斜杠被归一化为正斜杠`() {
        // 模型常写 Windows 风格
        assertEquals("src/a.ts", ok("src\\a.ts"))
    }

    @Test
    fun `混合分隔符被归一化`() {
        assertEquals("a/b/c", ok("a\\b/c"))
    }

    // ── 越界（安全关键）──

    @Test
    fun `上一级越界被拒绝`() {
        // 最经典的路径穿越
        assertEquals(WorkspacePath.ERROR_OUTSIDE, rejected("../secret"))
    }

    @Test
    fun `多级越界被拒绝`() {
        assertEquals(WorkspacePath.ERROR_OUTSIDE, rejected("../../etc/passwd"))
    }

    @Test
    fun `藏在中间的越界被拒绝`() {
        // a/../.. 从 a 回退到根，再退就出界了
        assertEquals(WorkspacePath.ERROR_OUTSIDE, rejected("a/../../x"))
    }

    @Test
    fun `反斜杠形式的越界也被拒绝`() {
        assertEquals(WorkspacePath.ERROR_OUTSIDE, rejected("..\\..\\secret"))
    }

    @Test
    fun `越界后回到内部仍被拒绝（保守）`() {
        // ../a/b 从逻辑上最终落在工作区外再进来，无法保证安全 —— 拒绝
        assertEquals(WorkspacePath.ERROR_OUTSIDE, rejected("../a/b"))
    }

    @Test
    fun `Unix 绝对路径被拒绝`() {
        assertEquals(WorkspacePath.ERROR_ABSOLUTE, rejected("/etc/passwd"))
        assertEquals(WorkspacePath.ERROR_ABSOLUTE, rejected("/data/data/com.x"))
    }

    @Test
    fun `Windows 盘符路径被拒绝`() {
        assertEquals(WorkspacePath.ERROR_ABSOLUTE, rejected("C:/Windows/System32"))
        assertEquals(WorkspacePath.ERROR_ABSOLUTE, rejected("c:\\windows"))
    }

    @Test
    fun `UNC 路径被拒绝`() {
        // \\server\share 归一化后以 // 开头
        assertEquals(WorkspacePath.ERROR_ABSOLUTE, rejected("\\\\server\\share"))
    }

    // ── 归一化 ──

    @Test
    fun `当前目录段被丢弃`() {
        assertEquals("a/b", ok("./a/./b"))
    }

    @Test
    fun `内部上一级被正确回退`() {
        // a/../b 与 b 等价 —— 这是合法的「回退后再进」
        assertEquals("b", ok("a/../b"))
    }

    @Test
    fun `重复斜杠被折叠`() {
        assertEquals("a/b", ok("a//b"))
    }

    @Test
    fun `末尾斜杠被去掉`() {
        assertEquals("a/b", ok("a/b/"))
    }

    @Test
    fun `回退到根仍合法`() {
        // a/.. 正好回到根，仍在工作区内
        assertEquals(WorkspacePath.ROOT_SENTINEL, ok("a/.."))
    }

    @Test
    fun `点当前目录返回根哨兵`() {
        assertEquals(WorkspacePath.ROOT_SENTINEL, ok("."))
        assertEquals(WorkspacePath.ROOT_SENTINEL, ok("./"))
    }

    // ── 空与空白 ──

    @Test
    fun `空路径被拒绝`() {
        assertEquals(WorkspacePath.ERROR_EMPTY, rejected(""))
        assertEquals(WorkspacePath.ERROR_EMPTY, rejected("   "))
    }

    @Test
    fun `首尾空白被容忍`() {
        assertEquals("a/b", ok("  a/b  "))
    }

    // ── isAbsolute ──

    @Test
    fun `isAbsolute 判定正确`() {
        assertTrue(WorkspacePath.isAbsolute("/x"))
        assertTrue(WorkspacePath.isAbsolute("C:/x"))
        assertTrue(WorkspacePath.isAbsolute("c:/x"))
        assertTrue(WorkspacePath.isAbsolute("//server/share"))
        assertTrue(!WorkspacePath.isAbsolute("x/y"))
        assertTrue(!WorkspacePath.isAbsolute("./x"))
    }

    @Test
    fun `单字母加冒号但无斜杠仍视为绝对`() {
        // "C:" 形式在某些上下文里是「C 盘当前目录」，仍是绝对
        assertTrue(WorkspacePath.isAbsolute("C:"))
    }

    @Test
    fun `非字母后的冒号不算盘符`() {
        // "1:/x" 不是盘符，不该被当成绝对路径拒掉
        assertTrue(!WorkspacePath.isAbsolute("1:/x"))
    }

    // ── display ──

    @Test
    fun `display 还原为可读形式`() {
        assertEquals("/src/a.ts", WorkspacePath.display("src/a.ts"))
        assertEquals("/", WorkspacePath.display(WorkspacePath.ROOT_SENTINEL))
    }

    @Test
    fun `所有拒绝原因非空且可读`() {
        // 原因会展示给用户/模型 —— 空串等于没解释
        assertTrue(WorkspacePath.ERROR_OUTSIDE.isNotBlank())
        assertTrue(WorkspacePath.ERROR_ABSOLUTE.isNotBlank())
        assertTrue(WorkspacePath.ERROR_EMPTY.isNotBlank())
    }
}
