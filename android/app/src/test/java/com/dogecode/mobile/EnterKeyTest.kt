package com.dogecode.mobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 回车键行为判据测试。
 *
 * 回到用户身上：这段错了的表现是「按回车没反应」（该发没发）
 * 或「写一半被发出去」（不该发却发了），两种都很烦人且难以归因到此处。
 *
 * 变异验证：把 shouldSend 的 `!shiftPressed` 去掉，
 * 「Shift+Enter 始终换行」用例失败。
 */
class EnterKeyTest {

    // ── shouldSend ──

    @Test
    fun `开启回车发送时回车即发送`() {
        assertTrue(EnterKey.shouldSend(sendOnEnter = true, shiftPressed = false))
    }

    @Test
    fun `关闭回车发送时回车换行`() {
        assertFalse(EnterKey.shouldSend(sendOnEnter = false, shiftPressed = false))
    }

    @Test
    fun `Shift+Enter 始终换行（关键）`() {
        // 这是「回车发送」模式下唯一的换行方式 —— 若不允许，
        // 用户想分段只能去设置里关掉开关，体验割裂
        assertFalse(EnterKey.shouldSend(sendOnEnter = true, shiftPressed = true))
        assertFalse(EnterKey.shouldSend(sendOnEnter = false, shiftPressed = true))
    }

    // ── isEnterKey ──

    @Test
    fun `KeyEvent 的 ENTER 被识别`() {
        assertTrue(EnterKey.isEnterKey(0, EnterKey.KEYCODE_ENTER))
    }

    @Test
    fun `SEND action 被识别`() {
        assertTrue(EnterKey.isEnterKey(EnterKey.IME_ACTION_SEND, 0))
    }

    @Test
    fun `DONE 与 NEXT 也被识别（不同输入法报的 action 不同）`() {
        // 只认 SEND 会导致部分机型上回车发送失效，且用户只会觉得
        // 「有时候好使有时候不好使」—— 极难定位
        assertTrue(EnterKey.isEnterKey(EnterKey.IME_ACTION_DONE, 0))
        assertTrue(EnterKey.isEnterKey(EnterKey.IME_ACTION_NEXT, 0))
    }

    @Test
    fun `无关 action 不被识别`() {
        assertFalse(EnterKey.isEnterKey(0, 0))
        assertFalse(EnterKey.isEnterKey(1, 0)) // IME_ACTION_GO
        assertFalse(EnterKey.isEnterKey(2, 0)) // IME_ACTION_SEARCH
    }

    @Test
    fun `两条路径的常量值正确（与 Android 定义一致）`() {
        // 值写错会让判据整体失效，而编译不会报错
        // （KeyEvent.KEYCODE_ENTER=66，IME_ACTION_SEND=4，DONE=6，NEXT=5）
        org.junit.Assert.assertEquals(66, EnterKey.KEYCODE_ENTER)
        org.junit.Assert.assertEquals(4, EnterKey.IME_ACTION_SEND)
        org.junit.Assert.assertEquals(6, EnterKey.IME_ACTION_DONE)
        org.junit.Assert.assertEquals(5, EnterKey.IME_ACTION_NEXT)
    }
}
