package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 本地偏好**定义**的测试（纯逻辑，不需要 Context）。
 *
 * 两处最易静默出错的判定：
 * 1. **默认值 = 改造前的实际行为**。若默认值写成了「新行为」，
 *    用户升级后会看到界面突变，而他没改过任何设置 —— 无从解释。
 * 2. **值合法性**：多选一的选项值必须非空且唯一。重复值会让
 *    「选中哪个」变得取决于顺序，且 UI 高亮会出错。
 *
 * 变异验证：把 KEY_STREAMING 的 default 从 ON 改成 OFF，
 * 「流式默认开启」用例失败。
 */
class LocalPrefsDefinitionTest {

    @Test
    fun `每项的键名唯一`() {
        val keys = LocalPrefs.ALL.map { it.key }
        assertEquals("键名重复会导致读写到同一项", keys.size, keys.toSet().size)
    }

    @Test
    fun `每项都有标题与说明`() {
        // 说明文字是硬要求：用户看到「消息密度：紧凑」时不知它影响什么
        LocalPrefs.ALL.forEach {
            assertTrue("${it.key} 缺标题", it.title.isNotBlank())
            assertTrue("${it.key} 缺说明文字", it.desc.isNotBlank())
        }
    }

    @Test
    fun `每项默认值都合法`() {
        // 默认值若不合法，读取时会被回落逻辑兜住 → 表现为「默认值不生效」
        LocalPrefs.ALL.forEach { d ->
            if (d.isToggle) {
                assertTrue("${d.key} 开关默认值应为 on/off", d.default in setOf(LocalPrefs.ON, LocalPrefs.OFF))
            } else {
                assertTrue(
                    "${d.key} 默认值 ${d.default} 不在可选项里",
                    d.options.any { it.first == d.default },
                )
            }
        }
    }

    @Test
    fun `多选一的选项值非空且唯一`() {
        LocalPrefs.ALL.filterNot { it.isToggle }.forEach { d ->
            val values = d.options.map { it.first }
            assertTrue("${d.key} 选项值不应为空", values.none { it.isBlank() })
            assertEquals("${d.key} 选项值重复会让高亮出错", values.size, values.toSet().size)
            assertTrue("${d.key} 应有至少两个选项", values.size >= 2)
        }
    }

    @Test
    fun `选项展示文案非空`() {
        LocalPrefs.ALL.filterNot { it.isToggle }.forEach { d ->
            d.options.forEach { (v, label) ->
                assertTrue("${d.key} 的 $v 缺展示文案", label.isNotBlank())
            }
        }
    }

    // ── 默认值必须 = 改造前的实际行为（避免升级后界面突变）──

    @Test
    fun `流式默认开启`() {
        // 流式是本轮刚实现的功能，用户已习惯；默认关闭会造成「怎么不流式了」
        val d = LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_STREAMING }
        assertEquals(LocalPrefs.ON, d.default)
    }

    @Test
    fun `自动滚动默认开启`() {
        // 原来就是「新消息滚到底」，保持不变
        val d = LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_AUTO_SCROLL }
        assertEquals(LocalPrefs.ON, d.default)
    }

    @Test
    fun `Markdown 与代码着色默认开启`() {
        // 原来就有这两个能力
        assertEquals(LocalPrefs.ON, LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_MARKDOWN }.default)
        assertEquals(LocalPrefs.ON, LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_CODE_HIGHLIGHT }.default)
    }

    @Test
    fun `三类通知默认全部开启`() {
        // 原来通知是全开的（回复 + 需介入 + 终端活跃抑制）
        assertEquals(LocalPrefs.ON, LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_NOTIFY_REPLY }.default)
        assertEquals(LocalPrefs.ON, LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_NOTIFY_ACTION }.default)
        assertEquals(LocalPrefs.ON, LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_NOTIFY_SUPPRESS }.default)
    }

    @Test
    fun `危险操作二次确认默认开启`() {
        // 安全相关的默认值应当偏保守
        assertEquals(LocalPrefs.ON, LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_CONFIRM_DANGEROUS }.default)
    }

    @Test
    fun `外观类默认值符合改造前的观感`() {
        // 改造前就是深色、中等字号、舒适密度、绝对时间
        assertEquals("dark", LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_THEME }.default)
        assertEquals("medium", LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_FONT_SCALE }.default)
        assertEquals("comfortable", LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_DENSITY }.default)
        assertEquals("absolute", LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_TIME_FORMAT }.default)
    }

    // ── labelOf 的展示逻辑 ──

    @Test
    fun `开关的展示文案为已开启或已关闭`() {
        val d = LocalPrefs.ALL.first { it.isToggle }
        assertEquals("已开启", d.labelOf(LocalPrefs.ON))
        assertEquals("已关闭", d.labelOf(LocalPrefs.OFF))
    }

    @Test
    fun `多选一按值取展示文案`() {
        val d = LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_THEME }
        assertEquals("深色", d.labelOf("dark"))
        assertEquals("跟随系统", d.labelOf("system"))
    }

    @Test
    fun `未知值回落为原值本身（不显示空白）`() {
        // 显示空白会让用户以为设置坏了；显示原值至少能看出「是个未识别的值」
        val d = LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_THEME }
        assertEquals("weird", d.labelOf("weird"))
    }

    @Test
    fun `开关判定只对无选项的项成立`() {
        assertTrue(LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_STREAMING }.isToggle)
        assertFalse(LocalPrefs.ALL.first { it.key == LocalPrefs.KEY_THEME }.isToggle)
    }
}
