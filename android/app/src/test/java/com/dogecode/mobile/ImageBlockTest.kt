package com.dogecode.mobile

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 图片内容块的构造测试。
 *
 * 这段逻辑决定「AI 能不能看到图」。构造错了不会有异常，只会让模型
 * 收到一个无法解析的块 —— 表现为「AI 说我看不到图」，而客户端一切正常。
 * 因此必须把**字段名**钉死：Anthropic 的图片块是
 * `{type:'image', source:{type:'base64', media_type, data}}`，
 * `media_type` 是 snake_case（不是 mediaType）。
 *
 * 与服务端 inboundMessages.ts 的 normalizeImageBlocks 形成双向契约：
 * 服务端能兼容 camelCase，但客户端不该依赖它的宽容 —— 发对的形状。
 */
class ImageBlockTest {

    /** 复刻 BridgeClient.sendMessageWithImages 的块构造（纯逻辑部分）。 */
    private fun buildBlocks(text: String, images: List<Pair<String, String>>): JSONArray {
        val blocks = JSONArray()
        if (text.isNotBlank()) {
            blocks.put(JSONObject().apply {
                put("type", "text")
                put("text", text)
            })
        }
        images.forEach { (mediaType, data) ->
            blocks.put(JSONObject().apply {
                put("type", "image")
                put("source", JSONObject().apply {
                    put("type", "base64")
                    put("media_type", mediaType)
                    put("data", data)
                })
            })
        }
        return blocks
    }

    @Test
    fun `图片块使用 snake_case 的 media_type`() {
        // 这是最容易写错的一处：写成 mediaType 会让服务端多做一次
        // normalize，若那个兼容逻辑未来被移除就会静默失效
        val blocks = buildBlocks("", listOf("image/jpeg" to "AAA"))
        val src = blocks.getJSONObject(0).getJSONObject("source")
        assertTrue("必须含 media_type", src.has("media_type"))
        assertEquals("image/jpeg", src.getString("media_type"))
        assertTrue("不应出现 camelCase 形式", !src.has("mediaType"))
    }

    @Test
    fun `source 的 type 必须是 base64`() {
        val blocks = buildBlocks("", listOf("image/png" to "AAA"))
        assertEquals("base64", blocks.getJSONObject(0).getJSONObject("source").getString("type"))
    }

    @Test
    fun `有文本时文本块在前图片块在后`() {
        // 顺序即模型看到的顺序：「看看这个报错」然后才是图，符合自然表达
        val blocks = buildBlocks("看看这个报错", listOf("image/jpeg" to "AAA"))
        assertEquals(2, blocks.length())
        assertEquals("text", blocks.getJSONObject(0).getString("type"))
        assertEquals("image", blocks.getJSONObject(1).getString("type"))
    }

    @Test
    fun `无文本时只有图片块`() {
        // 纯截图场景很常见（拍张报错图直接问），不该塞一个空文本块 ——
        // 空文本块可能被模型当成「用户什么都没说」而拒绝作答
        val blocks = buildBlocks("", listOf("image/jpeg" to "AAA"))
        assertEquals(1, blocks.length())
        assertEquals("image", blocks.getJSONObject(0).getString("type"))
    }

    @Test
    fun `纯空白文本不生成文本块`() {
        val blocks = buildBlocks("   \n  ", listOf("image/jpeg" to "AAA"))
        assertEquals(1, blocks.length())
        assertEquals("image", blocks.getJSONObject(0).getString("type"))
    }

    @Test
    fun `base64 数据原样保留不被截断`() {
        // 大图压缩后仍可能几百 KB —— 任何截断都会让图片损坏，
        // 而损坏的图片块会让整个 API 调用失败
        val big = "A".repeat(500_000)
        val blocks = buildBlocks("", listOf("image/jpeg" to big))
        assertEquals(big.length, blocks.getJSONObject(0).getJSONObject("source").getString("data").length)
    }
}
