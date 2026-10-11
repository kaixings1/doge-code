package com.dogecode.mobile

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import android.speech.RecognizerIntent
import android.widget.Toast
import androidx.core.content.FileProvider
import kotlin.concurrent.thread

/**
 * 输入手段：图片附件（拍照/相册）与语音输入。
 *
 * 从 MainActivity 抽出（约 120 行）。这是第二块边界清晰、可独立拆分的职责：
 * 它只依赖 Activity 的 Context 与 startActivityForResult 能力，
 * 不碰对话页控件（除了通过 [Host] 回调报告结果）。
 *
 * 两个设计要点（都在注释里保留了理由）：
 * · 图片先压缩再发 —— 原图 5-10MB，base64 后更大，塞一帧既慢又可能超限
 * · 语音识别用系统能力，不引入第三方 SDK —— 不增加依赖与隐私面
 */
class InputActions(
    private val activity: Activity,
    private val host: Host,
) {

    /** 宿主需要提供的能力。 */
    interface Host {
        /** 结果反馈（追加系统消息，让用户知道图片已附加）。 */
        fun appendSystem(text: String)
        /** 语音识别结果写回输入框（追加而非覆盖）。 */
        fun appendToInput(text: String)
        /** 当前输入框内容（语音追加时需要）。 */
        fun currentInput(): String
    }

    /** 已选待发送的图片（mediaType, base64）。发送后由宿主清空。 */
    var pendingImage: Pair<String, String>? = null
        private set

    /**
     * 已选待发送的文本附件（文件名, 内容）。
     *
     * 与图片分开存：图片走 ContentBlockParam（多模态），
     * 文本直接拼进 message —— 两条完全不同的发送路径。
     */
    private val pendingTexts = mutableListOf<Pair<String, String>>()

    /** 当前已附的文本附件（只读视图）。 */
    fun pendingTextAttachments(): List<Pair<String, String>> = pendingTexts.toList()

    /** 移除一个文本附件（按文件名）。 */
    fun removeTextAttachment(name: String) {
        pendingTexts.removeAll { it.first == name }
    }

    fun clearTextAttachments() {
        pendingTexts.clear()
    }

    /**
     * 选择一个文本文件作为附件。
     *
     * 用 ACTION_OPEN_DOCUMENT（SAF）而非 READ_EXTERNAL_STORAGE：
     * SAF 返回一次性 URI，**不需要任何存储权限** —— 权限最小化，
     * 且用户能从系统文件选择器里精确挑选那一个文件。
     */
    fun pickTextFile() {
        if (pendingTexts.size >= TextAttachment.MAX_FILES) {
            Toast.makeText(
                activity,
                activity.getString(R.string.attach_too_many, TextAttachment.MAX_FILES),
                Toast.LENGTH_SHORT,
            ).show()
            return
        }
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            // 只显示文本类 —— 减少用户选到二进制的机会。
            // 但系统筛选不可靠（很多文件管理器不认），故读取后仍要做白名单校验。
            type = "text/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/*", "application/json", "application/xml"))
        }
        runCatching { activity.startActivityForResult(intent, REQ_TEXT_FILE) }
            .onFailure { Toast.makeText(activity, "本机没有可用的文件选择器", Toast.LENGTH_SHORT).show() }
    }

    /**
     * 读取并校验文本文件。
     *
     * 读全程在后台线程 —— 文件可能很大，主线程读会 ANR。
     */
    private fun loadTextForAttach(uri: Uri) {
        thread {
            val result = runCatching {
                val name = queryDisplayName(uri) ?: "attachment.txt"
                val content = activity.contentResolver.openInputStream(uri)?.use {
                    it.bufferedReader().readText()
                } ?: return@runCatching null
                name to content
            }.getOrNull()

            activity.runOnUiThread {
                if (result == null) {
                    Toast.makeText(activity, "读取文件失败", Toast.LENGTH_SHORT).show()
                    return@runOnUiThread
                }
                val (name, content) = result
                when (val check = TextAttachment.check(name, content, pendingTexts.size)) {
                    is TextAttachment.Check.Ok -> {
                        pendingTexts.add(name to content)
                        host.appendSystem(
                            "已附加 $name（${content.length} 字符，共 ${pendingTexts.size} 个附件）",
                        )
                    }
                    is TextAttachment.Check.Unsupported -> Toast.makeText(
                        activity,
                        activity.getString(R.string.attach_unsupported, name),
                        Toast.LENGTH_LONG,
                    ).show()
                    is TextAttachment.Check.TooLarge -> Toast.makeText(
                        activity,
                        activity.getString(
                            R.string.attach_too_large,
                            name,
                            check.chars / 1024,
                            TextAttachment.MAX_CHARS / 1024,
                        ),
                        Toast.LENGTH_LONG,
                    ).show()
                    is TextAttachment.Check.TooMany -> Toast.makeText(
                        activity,
                        activity.getString(R.string.attach_too_many, TextAttachment.MAX_FILES),
                        Toast.LENGTH_SHORT,
                    ).show()
                }
            }
        }
    }

    /** 从 SAF URI 取显示名（用户看到的文件名）。取不到返回 null。 */
    private fun queryDisplayName(uri: Uri): String? = runCatching {
        activity.contentResolver.query(uri, null, null, null, null)?.use { c ->
            val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && c.moveToFirst()) c.getString(idx) else null
        }
    }.getOrNull()

    /** 拍照用的临时文件（ACTION_IMAGE_CAPTURE 需要 FileProvider URI）。 */
    private var photoFile: java.io.File? = null

    /** 清空待发图片（发送后 / 取消时）。 */
    fun clearPendingImage() {
        pendingImage = null
    }

    /**
     * 选择图片：拍照或从相册选。
     *
     * 用系统能力（ACTION_IMAGE_CAPTURE / ACTION_GET_CONTENT）而非自建相册：
     * 走 SAF 拿到的一次性 URI 不需要任何存储权限，权限最小化。
     */
    fun pickImage() {
        val options = arrayOf("拍照", "从相册选择")
        AlertDialog.Builder(activity)
            .setTitle("发送图片")
            .setItems(options) { _, which ->
                if (which == 0) capturePhoto() else chooseFromGallery()
            }
            .show()
    }

    private fun capturePhoto() {
        val dir = java.io.File(activity.cacheDir, "img").apply { mkdirs() }
        val f = java.io.File(dir, "shot_${System.currentTimeMillis()}.jpg")
        photoFile = f
        // 相机 App 需要能写这个文件：用 FileProvider 暴露 URI。
        // 直接传 file:// 在 Android 7+ 会抛 FileUriExposedException。
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", f)
        val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
            putExtra(MediaStore.EXTRA_OUTPUT, uri)
            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        }
        runCatching { activity.startActivityForResult(intent, REQ_CAPTURE) }
            .onFailure { Toast.makeText(activity, "本机没有可用的相机", Toast.LENGTH_SHORT).show() }
    }

    private fun chooseFromGallery() {
        val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
            type = "image/*"
            addCategory(Intent.CATEGORY_OPENABLE)
        }
        runCatching { activity.startActivityForResult(intent, REQ_GALLERY) }
            .onFailure { Toast.makeText(activity, "本机没有可用的图片选择器", Toast.LENGTH_SHORT).show() }
    }

    /**
     * 读取图片 URI 并压缩为待发送的 base64。
     *
     * 压缩是必须的：手机拍的原图常达 5-10MB，base64 后膨胀约 1/3，
     * 一次 WebSocket 帧发这么大既慢又可能触发帧上限。
     * 而 AI 看清代码截图只需长边约 1600px。
     *
     * 失败时给出明确提示而不是静默：用户选了图却什么都没发生是最糟的体验。
     */
    private fun loadImageForSend(uri: Uri, sourceLabel: String) {
        thread {
            val result = runCatching { ImageCompressor.compress(activity, uri) }.getOrNull()
            activity.runOnUiThread {
                if (result == null) {
                    Toast.makeText(activity, "读取图片失败", Toast.LENGTH_SHORT).show()
                    return@runOnUiThread
                }
                pendingImage = result
                host.appendSystem("已附加$sourceLabel（${result.second.length / 1024} KB）")
            }
        }
    }

    /**
     * 启动系统语音识别，把结果追加到输入框。
     *
     * 为什么用系统能力而不集成第三方 SDK：手机上描述一段需求比打字快得多，
     * 但为这一项引入几 MB 的语音库不划算 —— 系统自带识别已够用，
     * 且不增加依赖与隐私面。
     *
     * 追加而非覆盖：用户可能已经打了一半文字，覆盖会让他丢掉已输入内容。
     */
    fun startVoiceInput() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            // 用中文识别：本项目主要面向中文用户
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "请说话…")
        }
        try {
            activity.startActivityForResult(intent, REQ_VOICE)
        } catch (e: android.content.ActivityNotFoundException) {
            // 设备没装语音识别服务（部分精简 ROM、模拟器）时不该崩溃，
            // 直接弹引导对话框告知去系统设置开启
            showVoiceUnavailableDialog()
        } catch (e: SecurityException) {
            // 极少见的权限类异常 —— 同样引导而非崩溃
            showVoiceUnavailableDialog()
        }
    }

    /**
     * 语音识别不可用时的引导对话框。
     *
     * 触发场景（两类）：
     * 1. [startVoiceInput] 抛 ActivityNotFoundException / SecurityException
     *    （设备无语音识别服务、或精简 ROM 移除）
     * 2. [handleActivityResult] 收到 REQ_VOICE 非 OK 非取消结果
     *    （系统识别失败，典型表现就是界面上「似乎出错了(2)」）
     *
     * 用户原话「要求提前弹出授权相关设置」—— 这里的「授权」实际是
     * **系统语音识别引擎的启用/语音包安装**，并非运行时权限（RecognizerIntent
     * 不需要 RECORD_AUDIO 权限）。故引导去两处：
     * · 系统语音识别设置页（Settings.ACTION_VOICE_INPUT_SETTINGS，多数 ROM 有）
     * · 若没有语音引擎，提示从应用商店安装「Google 语音服务」
     *
     * 用对话框而非 Toast：这是需要用户主动操作才能解决的事，
     * Toast 一闪而过等于没提示。
     */
    private fun showVoiceUnavailableDialog() {
        val ctx = activity
        AlertDialog.Builder(ctx)
            .setTitle("语音输入不可用")
            .setMessage(
                "系统语音识别服务未启用或不可用。\n\n" +
                    "请到系统「语言和输入法 → 语音输入」中启用语音识别引擎，" +
                    "并确保已下载中文语音包；部分机型需在应用商店安装「Google 语音服务」。",
            )
            .setPositiveButton("去设置") { _, _ ->
                // 优先跳系统语音输入设置页；不可用时回退到语言设置
                val intent = Intent(android.provider.Settings.ACTION_VOICE_INPUT_SETTINGS)
                if (intent.resolveActivity(ctx.packageManager) != null) {
                    ctx.startActivity(intent)
                } else {
                    runCatching {
                        ctx.startActivity(
                            Intent(android.provider.Settings.ACTION_SETTINGS),
                        )
                    }
                }
            }
            .setNegativeButton("知道了", null)
            .show()
    }

    /**
     * 处理 Activity 结果。返回 true 表示本类已消费该结果。
     *
     * 由宿主的 onActivityResult 转发 —— 而不是让本类自己成为 Activity。
     */
    fun handleActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        // 图片：拍照结果在 photoFile 里（相机不通过 data 返回原图）
        if (requestCode == REQ_CAPTURE) {
            if (resultCode == Activity.RESULT_OK) {
                val f = photoFile
                if (f != null && f.exists()) loadImageForSend(Uri.fromFile(f), "照片")
            }
            return true
        }
        // 相册：URI 在 data 里
        if (requestCode == REQ_GALLERY) {
            if (resultCode == Activity.RESULT_OK) {
                data?.data?.let { loadImageForSend(it, "图片") }
            }
            return true
        }
        // 文本文件附件
        if (requestCode == REQ_TEXT_FILE) {
            if (resultCode == Activity.RESULT_OK) {
                data?.data?.let { loadTextForAttach(it) }
            }
            return true
        }
        // 语音识别
        if (requestCode == REQ_VOICE) {
            if (resultCode == Activity.RESULT_OK) {
                val spoken = data
                    ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                    ?.firstOrNull()
                    .orEmpty()
                if (spoken.isNotBlank()) {
                    val existing = host.currentInput()
                    val merged = if (existing.isBlank()) spoken else "$existing $spoken"
                    host.appendToInput(merged)
                }
            } else {
                // 非 OK 结果：系统语音识别服务返回了错误或被取消。
                // 此前这里静默忽略 → 用户只看到「按了没反应」，最典型的就是
                // 报错「似乎出错了(2)」后毫无引导。现区分两种来源：
                // · RESULT_CANCELED = 用户主动取消（不需要提示）
                // · 其它 = 系统识别失败，多半是设备没装/未启用语音识别引擎
                if (resultCode != Activity.RESULT_CANCELED) {
                    showVoiceUnavailableDialog()
                }
            }
            return true
        }
        return false
    }

    companion object {
        private const val REQ_VOICE = 2001
        private const val REQ_CAPTURE = 2002
        private const val REQ_GALLERY = 2003
        private const val REQ_TEXT_FILE = 2004
    }
}
