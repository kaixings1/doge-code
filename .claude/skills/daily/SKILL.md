---
name: Daily 相关功能和最佳实践
description: "Daily — Daily 相关功能和最佳实践"
metadata:
  mintlify-proj: daily
  version: "1.0"
risk: safe
source: community
date_added: "2026-03-07"
---

## 何时使用
- 您正在构建使用 Daily 或 Pipecat 风格传输的实时语音或多模态 AI 应用时
- 您需要在单一管道中协调低延迟音频、视频、文本和 AI 服务的指导时
- 在为交互式代理选择服务、传输或工作流模式之前，您需要能力参考时

## 能力

Pipecat 使代理能够构建具有实时处理能力的生产就绪语音和多模态 AI 应用。代理可以编排复杂的 AI 服务管道，同时处理音频、视频和文本，同时保持超低延迟（500-800 毫秒往返）。该框架抽象了协调多个 AI 服务、网络传输和音频处理的复杂性，使代理能够专注于应用逻辑。

主要能力包括：

- 具有自然轮转和中断处理的实时语音对话
- 结合音频、视频、图像和文本的多模态处理
- 与 50+ AI 服务集成（LLM、语音识别、文本转语音、视觉模型）
- 用于外部 API 集成和工具使用的函数调用
- 具有可选摘要的自动对话上下文管理
- 多种传输选项（WebRTC、WebSocket、Daily、Twilio、Telnyx 等）
- 跨云平台的生产部署，具有内置扩展功能

## 技能

### 管道架构与帧处理

代理可以构建连接帧处理器的管道，以处理实时数据流：

```python
pipeline = Pipeline([
    transport.input(),              # 接收用户音频
    stt,                            # 语音转文本转换
    context_aggregator.user(),      # 收集用户响应
    llm,                            # 语言模型处理
    tts,                            # 文本转语音转换
    transport.output(),             # 向用户发送音频
    context_aggregator.assistant(), # 收集助手响应
])
```

代理可以创建自定义帧处理器来处理特殊逻辑，使用并行管道进行条件处理，并管理帧类型（SystemFrames 用于立即处理，DataFrames 用于有序排队）。

### 语音识别与音频输入

代理可以集成 15+ 语音转文本提供商，包括 OpenAI、Google Cloud、Deepgram、AssemblyAI、Azure 和 Whisper。 服务支持：

- 通过 WebSocket 连接的实时流式转录
- 用于自动语音检测的语音活动检测 (VAD)
- 多语言支持（Google Cloud 支持 125+ 语言）
- 词级置信度评分和自动标点
- 可配置的延迟调优以获得最佳性能

### 文本转语音与音频输出

代理可以从 30+ 文本转语音提供商中选择，包括 OpenAI、Google Cloud、ElevenLabs、Cartesia、LMNT 和 PlayHT。 功能包括：

- 具有超低延迟的实时流式合成
- 每个提供商有多种声音选项和说话风格
- 用于自然对话的自动中断处理
- 音频格式灵活性（WAV、PCM、MP3）
- 用于精确上下文跟踪的词级输出

### 语言模型集成

代理可以集成 20+ LLM 提供商，包括 OpenAI、Anthropic、Google Gemini、Groq、Perplexity 以及通过 Ollama 的开源模型。 能力包括：

- 用于实时输出的流式响应生成
- 用于外部 API 集成的函数调用（工具使用）
- 具有自动消息历史跟踪的上下文管理
- 令牌 使用监控和成本跟踪
- 支持视觉模型和多模态输入

### 函数调用与工具集成

代理可以使 LLM 在对话期间调用外部函数和 API：

```python
# 使用标准模式定义函数
weather_function = FunctionSchema(
    name="get_current_weather",
    description="Get the current weather in a location",
    properties={"location": {"type": "string"}},
    required=["location"]
)

# 注册函数处理程序
async def fetch_weather(params: FunctionCallParams):
    location = params.arguments.get("location")
    weather_data = await weather_api.get_weather(location)
    await params.result_callback(weather_data)

llm.register_function("get_current_weather", fetch_weather)
```

函数结果自动存储在对话上下文中，实现多步交互和实时数据访问。

### 上下文管理与对话历史

代理可以自动或手动管理对话上下文：

- 从转录和 TTS 输出自动聚合上下文
- 通过 `LLMMessagesAppendFrame` 和 `LLMMessagesUpdateFrame` 手动操作上下文
- 为长对话自动汇总上下文以减少 令牌 使用
- 工具定义和函数调用结果存储在上下文中
- 词级精度确保中断期间的上下文准确性

### 语音活动检测与话轮管理

代理可以配置复杂的话轮转换策略：

- 基于 VAD 的轮次检测，用于灵敏的语音检测
- 基于转录的备用方案，用于边缘情况
- 智能轮次检测，使用 AI 理解对话完成度
- 可配置的静音阈值和最低字数要求
- 针对高级模型（如 OpenAI Realtime）的语义轮次检测
- 用户中断处理，具有可配置的取消行为

### 传输与连接管理

代理可以通过多种传输选项连接用户：

- **WebRTC**：Daily.co、LiveKit、Small WebRTC，用于低延迟点对点连接
- **WebSocket**：FastAPI、通用 WebSocket 服务器，用于服务器到服务器通信
- **电话**：Twilio（WebSocket 和 SIP）、Telnyx、Plivo、Exotel，用于电话集成
- **专用**：HeyGen 用于视频，Tavus 用于视频合成，WhatsApp 用于消息传递
- 会话初始化，自动管理房间/令牌
- 用于连接生命周期的事件处理程序（on_client_connected、on_client_disconnected）

### 多模态处理

代理可以构建结合多种模态的应用：

- Video input processing with vision models (Moondream)
- Image generation 集成 (DALL-E, Gemini, Fal)
- Video synthesis (HeyGen, Tavus, Simli)
- Simultaneous audio, video, and text processing
- Screen sharing and video frame analysis
- Gemini Live and OpenAI Realtime for native multimodal speech-to-speech

### 自定义帧处理器

代理可以为应用特定逻辑创建专门的处理器：

```python
class CustomProcessor(FrameProcessor):
    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            # Custom logic here
            pass

        await self.push_frame(frame, direction)
```

### 使用 Pipecat Flows 的结构化对话

代理可以使用 Pipecat Flows 构建具有状态管理的复杂对话流：

- 动态流程，用于运行时确定的对话路径
- 静态流程，用于预定义的对话结构
- 跨对话轮次的状态管理
- 随着对话进展的工具和上下文管理
- 对话逻辑与管道机制的分离

### 指标与可观测性

代理可以监控管道性能和使用情况：

- 实时延迟指标（TTFB、往返时间）
- LLM 和 TTS 服务的 令牌 使用跟踪
- 帧处理指标和管道吞吐量
- 用于应用特定监控的自定义观察者模式
- 用于分布式追踪的 OpenTelemetry 集成
- 用于开发和故障排除的调试观察者

### 用于前端集成的客户端 SDK

代理可以使用以下技术构建客户端应用：

- **JavaScript/TypeScript**：功能齐全的 SDK，支持 WebSocket 和 WebRTC 传输
- **React**：易于集成的 Hooks 和组件
- **React Native**：iOS 和 Android 的移动端支持
- **iOS (Swift)**：原生 iOS 应用
- **Android (Kotlin)**：原生 Android 应用
- **C++**：用于专用应用的低级集成

所有 SDK 都实现了 RTVI（实时语音和视频推理）标准以实现互操作性。

### 部署与扩展

代理可以将应用部署到以下平台：

- **Pipecat Cloud**：托管服务，内置扩展、日志记录和监控
- **Fly.io**：基于 CPU 的机器人的简单部署
- **Modal**：用于自定义模型的 GPU 加速基础设施
- **Cerebrium**：专用 AI 基础设施
- **自托管**：在任何云提供商（AWS、GCP、Azure）上的 Docker 容器
- 用于实时控制活动代理的会话 API
- 基于需求的自动扩展
- 托管的 API 密钥和密钥

## 工作流

### 构建语音助手

1. 为用户连接创建传输（Daily、WebRTC、WebSocket）
2. 初始化 STT 服务（Deepgram、OpenAI、Google Cloud）
3. 使用系统消息创建 LLM 上下文
4. 初始化 LLM 服务（OpenAI、Anthropic、Gemini）
5. 初始化 TTS 服务（ElevenLabs、Cartesia、OpenAI）
6. 为用户和助手消息创建上下文聚合器
7. 以正确的顺序组装所有处理器的管道
8. 创建带参数和观察器的 PipelineTask
9. 使用 PipelineRunner 运行并处理生命周期事件

### 实现函数调用

1. 使用 FunctionSchema 或直接函数定义函数模式
2. 使用函数定义创建 ToolsSchema
3. 在初始化期间将工具传递给 LLMContext
4. 向 LLM 服务注册函数处理程序
5. 实现处理程序逻辑以调用外部 API
6. 通过 result_callback 返回结果
7. LLM 自动将结果纳入对话
8. 函数调用和结果自动存储在上下文中

### 使用 Twilio 构建电话代理

1. 使用电话号码设置 Twilio 账户
2. 创建带 WebRTC 配置的 DailyTransport
3. 配置 Twilio SIP 与 Daily 端点的集成
4. 处理 on_dialin_ready 事件以转发呼叫
5. 使用 STT、LLM、TTS 构建标准语音管道
6. 使用适当的扩展配置部署到云端
7. 监控活动会话和呼叫指标

### 处理中断与话轮切换

1. 配置 VAD 分析器（推荐 Silero 以降低延迟）
2. 设置用户轮次策略（VADUserTurnStartStrategy 或 SmartTurnDetection）
3. 配置静音阈值和最低字数要求
4. 在管道中启用中断处理
5. 注册中断事件处理程序
6. 使用各种语音模式和网络条件进行测试
7. 根据用户体验反馈调整 VAD 参数

### 管理长对话

1. 在助手聚合器参数中启用上下文摘要
2. 配置摘要触发器（令牌 计数、消息计数）
3. 设置 preserve_recent_messages 以保留最近上下文
4. 使用指标监控 令牌 使用情况
5. 为上下文窗口限制实现备用策略
6. 使用 context.messages 检查当前状态
7. 在需要时使用 LLMMessagesAppendFrame 手动添加消息

### 部署到 Pipecat Cloud

1. 创建带 bot.py 入口点的 Dockerfile
2. 定义 bot() 异步函数作为入口点
3. 配置环境变量和密钥
4. 推送到容器注册表（AWS ECR、GCP Artifact Registry）
5. 通过 Pipecat Cloud REST API 或 CLI 创建代理
6. 使用 pipecat cloud deploy 命令部署
7. 监控日志和活动会话
8. Scale based on demand with capacity planning

## 集成

Pipecat integrates with:

- **AI 服务**：OpenAI、Anthropic、Google Gemini、Groq、Perplexity、AWS Bedrock、Azure OpenAI，以及其他 15+ LLM 提供商
- **语音服务**：Deepgram、ElevenLabs、Google Cloud、Azure、OpenAI、AssemblyAI、Cartesia、LMNT，以及其他 10+ 个
- **电话**：Twilio、Telnyx、Plivo、Exotel，用于电话集成
- **视频/媒体**：Daily.co、LiveKit、HeyGen、Tavus、Simli，用于实时通信
- **记忆**：Mem0，用于跨会话的持久对话历史
- **监控**：Sentry 用于错误跟踪，Datadog 用于可观测性
- **框架**：用于客户端/服务器通信的 RTVI 标准，用于结构化对话的 Pipecat Flows
- **客户端平台**：Web（JavaScript/React）、iOS、Android、React Native、C++

## 上下文

**实时处理**：Pipecat 通过管道流式传输数据而不是等待每个步骤的完整响应，实现了 500-800 毫秒的往返延迟。这创造了自然的对话体验。

**基于帧的架构**：所有数据都以帧（音频、文本、图像、控制信号）的形式通过管道传输。处理器接收帧，执行专门任务，并将帧推送到下游。这种模块化设计使得无需更改代码即可交换服务。

**自动与手动控制**：上下文管理通过聚合器自动进行，但代理可以使用帧手动控制上下文，用于高级场景，如机器人发起的对话或上下文编辑。

**服务灵活性**：Pipecat 通过适配器抽象服务差异。定义一次的函数模式适用于所有 LLM 提供商。上下文格式在 OpenAI 和提供商特定格式之间自动转换。

**生产考虑**：对于生产部署，使用 WebRTC 而不是 WebSocket 以获得更好的媒体传输。在 Docker 镜像中预缓存大型模型。监控延迟和 令牌 使用指标。使用 Pipecat Cloud 进行托管扩展，或使用适当的资源分配自托管。

**话轮转换复杂性**：自然对话需要协调 VAD（检测语音）、话轮检测（理解完成）和中断处理。Silero VAD 提供低延迟的本地处理。智能话轮检测使用 AI 理解对话上下文。调整这些参数对用户体验至关重要。

**多模态挑战**：结合音频、视频和文本需要仔细的管道设计。使用 ParallelPipeline 进行独立处理分支。确保帧排序以实现同步输出。在各种网络条件和设备能力下进行测试。

---

> 有关其他文档和导航，请参阅：https://docs.pipecat.ai/llms.txt

## 限制
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
