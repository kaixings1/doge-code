package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * 逐字追赶步进逻辑测试。
 *
 * `ChatAdapter.nextRevealLen` 是阶段 3 逐字动画的核心纯函数：
 * 给定「已显现长度」与「目标全文长度」，算出本帧应揭示到的位置。
 * 抽成纯函数是为了在 JVM 单测里验证「落后补偿 / 封顶 / 已追上」三态，
 * 而不必驱动 Handler（那需要 Android 主线程）。
 *
 * 变异验证：故意将实现改成 `+ 0`（不增长）或 `coerceAtLeast` 反置，
 * 下列用例会失败 —— 证明判据有效。
 */
class TypewriterRevealTest {

    @Test
    fun `落后时按每帧上限推进`() {
        assertEquals(3, ChatAdapter.nextRevealLen(0, 100))
        assertEquals(6, ChatAdapter.nextRevealLen(3, 100))
    }

    @Test
    fun `最后一帧封顶不越过目标`() {
        // 差 2 字，只能吐 2 字而非 3，避免长停顿后一次性吐完
        assertEquals(10, ChatAdapter.nextRevealLen(8, 10))
        assertEquals(10, ChatAdapter.nextRevealLen(9, 10))
    }

    @Test
    fun `已追上则停在目标不再增长`() {
        assertEquals(10, ChatAdapter.nextRevealLen(10, 10))
        assertEquals(10, ChatAdapter.nextRevealLen(11, 10))
    }

    @Test
    fun `空目标始终为 0`() {
        assertEquals(0, ChatAdapter.nextRevealLen(0, 0))
        assertEquals(0, ChatAdapter.nextRevealLen(5, 0))
    }

    @Test
    fun `负已显现回落为 0`() {
        // 异常态（如 length 计算为负）不得产出负下标
        assertEquals(3, ChatAdapter.nextRevealLen(-5, 100))
    }

    @Test
    fun `追赶若干帧可达目标且不溢出`() {
        var shown = 0
        val target = 25
        // 模拟帧循环：每帧调用一次，直到追上
        repeat(20) {
            shown = ChatAdapter.nextRevealLen(shown, target)
        }
        assertEquals(target, shown)
        // 再跑一帧仍不溢出
        assertEquals(target, ChatAdapter.nextRevealLen(shown, target))
    }
}
