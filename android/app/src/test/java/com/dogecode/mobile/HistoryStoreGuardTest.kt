package com.dogecode.mobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 历史文件名的安全守卫测试。
 *
 * **这是安全关键测试**：`HistoryStore.delete` 是不可逆操作，
 * 且入参来自列表项。若守卫失效，一个路径穿越的名字（如
 * `history-../../x.json`）就能删掉数据目录之外的文件。
 *
 * 守卫有两层，缺一不可：
 * 1. 前缀/后缀必须匹配 `history-` / `.json`（限定在本类管理的文件范围内）
 * 2. 主体只允许字母数字与 `_.-`，且不含 `..`
 *
 * 变异验证：把 isSafeName 的 `body.contains("..")` 判断删掉，
 * 「路径穿越被拒绝」用例失败。
 */
class HistoryStoreGuardTest {

    // ── 合法文件名 ──

    @Test
    fun `正常文件名被接受`() {
        assertTrue(HistoryStore.isSafeName("history-127.0.0.1_5680.json"))
        assertTrue(HistoryStore.isSafeName("history-192.168.0.106_5681.json"))
        assertTrue(HistoryStore.isSafeName("history-localhost_5680.json"))
        // IPv6 经 keyFor 过滤后变成下划线形式
        assertTrue(HistoryStore.isSafeName("history-__1__5680.json"))
    }

    // ── 路径穿越（安全关键）──

    @Test
    fun `路径穿越被拒绝`() {
        // 这两条是最危险的：能删到数据目录之外
        assertFalse(HistoryStore.isSafeName("history-../../x.json"))
        assertFalse(HistoryStore.isSafeName("history-.._5680.json"))
        assertFalse(HistoryStore.isSafeName("history-a..b_5680.json"))
    }

    @Test
    fun `含斜杠被拒绝`() {
        assertFalse(HistoryStore.isSafeName("history-a/b.json"))
        assertFalse(HistoryStore.isSafeName("history-a\\b.json"))
    }

    @Test
    fun `不含前后缀被拒绝`() {
        // 限定在本类管理的文件范围内，避免误删别的文件
        assertFalse(HistoryStore.isSafeName("other-127.0.0.1_5680.json"))
        assertFalse(HistoryStore.isSafeName("history-127.0.0.1_5680.txt"))
        assertFalse(HistoryStore.isSafeName("history-127.0.0.1_5680"))
    }

    @Test
    fun `主体为空被拒绝`() {
        assertFalse(HistoryStore.isSafeName("history-.json"))
        assertFalse(HistoryStore.isSafeName("history.json"))
    }

    @Test
    fun `含特殊字符被拒绝`() {
        assertFalse(HistoryStore.isSafeName("history-a\$b.json"))
        assertFalse(HistoryStore.isSafeName("history-a b.json"))
        assertFalse(HistoryStore.isSafeName("history-a;b.json"))
        assertFalse(HistoryStore.isSafeName("history-a*b.json"))
        assertFalse(HistoryStore.isSafeName("history-a?b.json"))
    }

    @Test
    fun `空名字被拒绝`() {
        assertFalse(HistoryStore.isSafeName(""))
    }

    @Test
    fun `只有前缀后缀被拒绝`() {
        assertFalse(HistoryStore.isSafeName("history-.json"))
    }

    // ── 与 MessageStore.keyFor 的一致性（双向契约）──

    @Test
    fun `keyFor 的产物总是合法文件名`() {
        // 两个类的命名规则必须一致：keyFor 生成的名字，
        // isSafeName 必须认。否则「自己生成的历史自己删不掉」
        val hosts = listOf(
            "127.0.0.1", "192.168.0.106", "localhost", "[::1]",
            "../../etc", "a/b", "host with space", "HOST-NAME",
        )
        hosts.forEach { h ->
            val key = MessageStore.keyFor(h, 5680)
            val fileName = "${HistoryStore.PREFIX}$key${HistoryStore.SUFFIX}"
            assertTrue(
                "keyFor(\"$h\") 生成的 $fileName 应被 isSafeName 接受",
                HistoryStore.isSafeName(fileName),
            )
        }
    }
}
