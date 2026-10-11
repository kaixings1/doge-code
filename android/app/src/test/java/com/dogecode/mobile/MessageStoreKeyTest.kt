package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * MessageStore.keyFor 的测试。
 *
 * 这个函数生成历史文件名，两个要求：
 * 1. 不同会话必须产生不同文件名（否则历史串味）
 * 2. 产物必须是合法文件名（否则写文件抛异常，历史静默丢失）
 */
class MessageStoreKeyTest {

    @Test
    fun `不同端口产生不同 key`() {
        assertNotEquals(
            MessageStore.keyFor("127.0.0.1", 5680),
            MessageStore.keyFor("127.0.0.1", 5681),
        )
    }

    @Test
    fun `不同主机产生不同 key`() {
        assertNotEquals(
            MessageStore.keyFor("127.0.0.1", 5680),
            MessageStore.keyFor("192.168.0.106", 5680),
        )
    }

    @Test
    fun `相同输入产生相同 key`() {
        assertEquals(
            MessageStore.keyFor("127.0.0.1", 5680),
            MessageStore.keyFor("127.0.0.1", 5680),
        )
    }

    @Test
    fun `冒号与 IPv6 方括号被替换为合法字符`() {
        // IPv6 形如 [::1]，含方括号与冒号，直接做文件名在 Windows 上非法
        val k = MessageStore.keyFor("[::1]", 5680)
        assertFalse("不应含冒号", k.contains(":"))
        assertFalse("不应含方括号", k.contains("[") || k.contains("]"))
    }

    @Test
    fun `Windows 非法文件名字符全部被替换`() {
        val illegal = listOf('\\', '/', ':', '*', '?', '"', '<', '>', '|')
        val k = MessageStore.keyFor("host" + illegal.joinToString(""), 5680)
        illegal.forEach { c ->
            assertFalse("不应含非法字符 $c", k.contains(c))
        }
    }

    @Test
    fun `路径穿越字符被消除`() {
        // 若主机名含 .. 或 / 而未被过滤，可能写到预期目录之外
        val k = MessageStore.keyFor("../../etc", 5680)
        assertFalse("不应含斜杠", k.contains("/"))
        assertFalse("不应含反斜杠", k.contains("\\"))
        assertFalse("不应出现连续的 ..", k.contains(".."))
    }

    @Test
    fun `结果非空且含端口`() {
        val k = MessageStore.keyFor("127.0.0.1", 5680)
        assertTrue(k.isNotEmpty())
        assertTrue(k.contains("5680"))
    }

    // ── keyForLocal：本地模式按工作区隔离（M1）──

    @Test
    fun `本地 key 以 local- 开头（与远端域不相交）`() {
        val k = MessageStore.keyForLocal("/sdcard/Documents/proj")
        assertTrue("必须以 local- 开头：$k", k.startsWith("local-"))
    }

    @Test
    fun `本地 key 与远端 key 不可能撞名`() {
        // 极端场景：用户在本地用了一个叫 "192.168.0.106_5680" 的目录
        val local = MessageStore.keyForLocal("/data/192.168.0.106_5680")
        val remote = MessageStore.keyFor("192.168.0.106", 5680)
        assertNotEquals("本地与远端必须分属不同域", local, remote)
        assertTrue("本地 key 有 local- 前缀", local.startsWith("local-"))
    }

    @Test
    fun `同一工作区多次调用产生同一个 key（历史可复用）`() {
        val a = MessageStore.keyForLocal("/sdcard/Documents/proj")
        val b = MessageStore.keyForLocal("/sdcard/Documents/proj")
        assertEquals(a, b)
    }

    @Test
    fun `同名不同路径的目录产生不同 key（后缀哈希区分）`() {
        val a = MessageStore.keyForLocal("/sdcard/Documents/proj")
        val b = MessageStore.keyForLocal("/sdcard/Downloads/proj")
        assertNotEquals("仅目录名相同不够，必须靠哈希区分", a, b)
    }

    @Test
    fun `尾斜杠不影响 key（规范化）`() {
        val a = MessageStore.keyForLocal("/sdcard/Documents/proj")
        val b = MessageStore.keyForLocal("/sdcard/Documents/proj/")
        assertEquals("尾斜杠不该产生第二份历史", a, b)
    }

    @Test
    fun `中文与空格目录名产生合法文件名`() {
        val k = MessageStore.keyForLocal("/sdcard/我的 项目")
        assertFalse("不应含空格", k.contains(" "))
        assertFalse("不应含斜杠", k.contains("/"))
        assertFalse("不应含中文（部分文件系统不友好）", k.contains("我"))
        assertTrue("应保留 local- 前缀", k.startsWith("local-"))
    }

    @Test
    fun `Emoji 目录名被过滤且不崩`() {
        val k = MessageStore.keyForLocal("/sdcard/proj-\uD83D\uDE00")
        assertFalse("不应含 emoji", k.contains("\uD83D\uDE00"))
        assertTrue(k.isNotEmpty())
    }

    @Test
    fun `路径穿越字符不产生非法 key`() {
        val k = MessageStore.keyForLocal("/sdcard/../../etc/passwd")
        assertFalse("不应含 /", k.contains("/"))
        assertFalse("不应含 ..", k.contains(".."))
    }

    @Test
    fun `空路径回落到 root 且不崩`() {
        val k = MessageStore.keyForLocal("")
        assertTrue("空路径应有兜底且有 local- 前缀：$k", k.startsWith("local-"))
        assertTrue(k.isNotEmpty())
    }

    @Test
    fun `目录名参与 key 便于用户辨认`() {
        val k = MessageStore.keyForLocal("/sdcard/Documents/myproj")
        assertTrue("目录名应出现在 key 中便于辨认：$k", k.contains("myproj"))
    }
}
