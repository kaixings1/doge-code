---
name: GroqCloud Automation
description: "通过 Composio 自动执行 GroqCloud 高性能 API 的 AI 推理、聊天补全、音频翻译和 TTS 语音管理"
requires:
  mcp:
    - rube
---

# GroqCloud 自动化

使用 GroqCloud 超高速 API 自动化 AI 推理工作流——聊天补全、模型发现、音频翻译和 TTS 语音选择——全部通过 Composio MCP 集成编排。

**工具包文档：** [composio.dev/toolkits/groqcloud](https://composio.dev/toolkits/groqcloud)

---

## 设置

1. 通过 Composio MCP 服务器 `https://rube.app/mcp` 连接您的 GroqCloud 账户
2. 如果没有活跃连接，代理将向您提供认证链接
3. 连接后，所有 `GROQCLOUD_*` 工具即可执行

---

## 核心工作流

### 1. 发现可用模型
列出 GroqCloud 上所有可用模型，以便在运行推理前查找有效的模型 ID。

**工具：** `GROQCLOUD_LIST_MODELS`

```
无需参数——返回所有可用模型及其元数据。
```

在任何聊天补全调用之前使用此作为前提条件，以确保您引用的是有效且未弃用的模型 ID。

---

### 2. 运行聊天补全
使用指定的 GroqCloud 模型为对话提示生成 AI 响应。

**工具：** `GROQCLOUD_GROQ_CREATE_CHAT_COMPLETION`

| 参数 | 类型 | 必需 | 描述 |
|-----------|------|----------|-------------|
| `model` | string | 是 | 来自 `GROQCLOUD_LIST_MODELS` 的模型 ID |
| `messages` | array | 是 | 有序的 `{role, content}` 对象列表（`system`、`user`、`assistant`） |
| `temperature` | number | 否 | 采样温度 0-2（默认：1） |
| `max_completion_tokens` | integer | 否 | 最大生成令牌数 |
| `top_p` | number | 否 | 核采样 0-1（默认：1） |
| `stop` | string/array | 否 | 最多 4 个停止序列 |
| `stream` | boolean | 否 | 启用 SSE 流式（默认：false） |

---

### 3. 检查模型详情
检索特定模型的详细元数据，包括上下文窗口和能力。

**工具：** `GROQCLOUD_GROQ_RETRIEVE_MODEL`

| 参数 | 类型 | 必需 | 描述 |
|-----------|------|----------|-------------|
| `model` | string | 是 | 模型标识符（例如 `groq-1-large`） |

---

### 4. 将音频翻译为英语
使用 Whisper 模型将非英语音频文件翻译为英语文本。

**工具：** `GROQCLOUD_GROQ_CREATE_AUDIO_TRANSLATION`

| 参数 | 类型 | 必需 | 描述 |
|-----------|------|----------|-------------|
| `file_path` | string | 是 | 音频的本地路径、HTTP(S) URL 或 base64 数据 URL |
| `model` | string | 否 | 模型 ID（默认：`whisper-large-v3`）。注意：`whisper-large-v3-turbo` 可能不支持翻译 |
| `response_format` | string | 否 | `json`、`verbose_json` 或 `text`（默认：`json`） |
| `temperature` | number | 否 | 采样温度 0-1（默认：0） |

---

### 5. 列出 TTS 语音
枚举 Groq PlayAI 模型可用的文本转语音声音，以驱动语音选择 UX。

**工具：** `GROQCLOUD_LIST_VOICES`

```
返回支持的 TTS 语音集。注意：此为手动维护的静态列表。
```

---

## 已知陷阱

| 陷阱 | 详情 |
|---------|---------|
| **嵌套模型列表** | `GROQCLOUD_LIST_MODELS` 响应可能嵌套在 `response['data']['data']` 中——不要假定是扁平顶层数组 |
| **硬编码模型 ID 会失效** | 始终通过 `GROQCLOUD_LIST_MODELS` 动态获取模型 ID；当模型被弃用或重命名时，硬编码名称可能失效 |
| **音频格式验证** | `GROQCLOUD_GROQ_CREATE_AUDIO_TRANSLATION` 静默拒绝无效或不支持的音频格式——调用前请验证输入 |
| **模型元数据变化** | 来自 `GROQCLOUD_GROQ_RETRIEVE_MODEL` 的数据（上下文窗口、功能）可能随模型更新而变化——不要视为静态 |
| **TTS 语音变更** | `GROQCLOUD_LIST_VOICES` 的语音集可能随时间减少或重命名——优雅地处理缺失语音 |

---

## 快速参考

| 工具标识 | 用途 |
|-----------|---------|
| `GROQCLOUD_LIST_MODELS` | 列出所有可用模型及其元数据 |
| `GROQCLOUD_GROQ_CREATE_CHAT_COMPLETION` | 生成基于聊天的 AI 补全 |
| `GROQCLOUD_GROQ_RETRIEVE_MODEL` | 获取特定模型的详细信息 |
| `GROQCLOUD_GROQ_CREATE_AUDIO_TRANSLATION` | 将非英语音频翻译为英语文本 |
| `GROQCLOUD_LIST_VOICES` | 检索 PlayAI 可用的 TTS 语音 |

---

*由 [Composio](https://composio.dev) 提供支持*
