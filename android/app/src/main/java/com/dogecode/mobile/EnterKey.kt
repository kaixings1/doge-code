package com.dogecode.mobile

/**
 * 回车键行为判据（纯逻辑，可单测）。
 *
 * 背景：输入框是多行的（`textMultiLine`），这种输入法的换行键**不会**
 * 触发 `IME_ACTION_SEND` —— 此前依赖它的「回车发送」实现是死代码，
 * 用户按回车只会换行，必须点发送按钮。
 *
 * 现在同时拦截两条路径（物理键盘的 KeyEvent、软键盘的 EditorAction），
 * 判据相同，故抽成一处 —— 两处各写一份必然有一天会改漏一边，
 * 表现为「物理键盘能发送、软键盘不能」这种极难定位的不一致。
 */
object EnterKey {

    /**
     * 按下回车时应否「发送」而非「换行」。
     *
     * @param sendOnEnter 用户偏好：回车发送（true）还是回车换行（false）
     * @param shiftPressed 是否按住 Shift
     *
     * Shift+Enter **始终换行**，无论偏好如何：
     * · 「回车发送」模式下，这是唯一的换行方式 —— 否则用户想分段
     *   只能去设置里关掉这个开关，体验很割裂
     * · 与桌面端习惯一致（聊天软件普遍如此）
     */
    fun shouldSend(sendOnEnter: Boolean, shiftPressed: Boolean): Boolean =
        sendOnEnter && !shiftPressed

    /**
     * 该输入事件是否应被视为「回车键」。
     *
     * 需要同时认多种 actionId：不同输入法在 `textMultiLine` 下报的
     * 可能是 SEND / DONE / NEXT 之一，只认 SEND 会导致部分机型上
     * 回车发送失效（且用户只会觉得「有时候好使有时候不好使」）。
     *
     * @param actionId EditorInfo 的 actionId；无 action 时传 0
     * @param eventKeyCode KeyEvent 的 keyCode；无（软键盘多数情况）时传 0
     */
    fun isEnterKey(actionId: Int, eventKeyCode: Int): Boolean = when {
        eventKeyCode == KEYCODE_ENTER -> true
        actionId == IME_ACTION_SEND -> true
        actionId == IME_ACTION_DONE -> true
        actionId == IME_ACTION_NEXT -> true
        else -> false
    }

    // 与 Android 常量同值。不直接引用 android.view 是为了让本对象
    // 能在纯 JVM 单测中直接调用（android.jar 的常量虽是编译期常量，
    // 但对象本身一旦 import android 类，测试环境就要额外桩化）。
    const val KEYCODE_ENTER = 66
    const val IME_ACTION_SEND = 4
    const val IME_ACTION_DONE = 6
    const val IME_ACTION_NEXT = 5
}
