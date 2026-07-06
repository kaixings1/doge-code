---
name: azure-ai-voicelive-ts
description: "Azure Ai Voicelive Ts — Azure Ai Voicelive Ts 相关功能和最佳实践"
risk: unknown
source: community
date_added: '2026-02-27'
---

# @azure/ai-voicelive (JavaScript/TypeScript)

Real-time voice AI SDK for building bidirectional voice assistants with Azure AI in Node.js and browser environments.

## 安装

```bash
npm install @azure/ai-voicelive @azure/identity
# TypeScript users
npm install @types/node
```

**Current Version**: 1.0.0-beta.3

**Supported Environments**:
- Node.js LTS versions (20+)
- Modern browsers (Chrome, Firefox, Safari, Edge)

## 环境变量

```bash
AZURE_VOICELIVE_ENDPOINT=https://<resource>.cognitiveservices.azure.com
# Optional: API key if not using Entra ID
AZURE_VOICELIVE_API_KEY=<your-api-key>
# Optional: Logging
AZURE_LOG_LEVEL=info
```

## 认证

### Microsoft Entra ID (Recommended)

```typescript
import { DefaultAzureCredential } from "@azure/identity";
import { VoiceLiveClient } from "@azure/ai-voicelive";

const credential = new DefaultAzureCredential();
const 端点 = "https://your-resource.cognitiveservices.azure.com";

const client = new VoiceLiveClient(端点, credential);
```

### API Key

```typescript
import { AzureKeyCredential } from "@azure/core-auth";
import { VoiceLiveClient } from "@azure/ai-voicelive";

const 端点 = "https://your-resource.cognitiveservices.azure.com";
const credential = new AzureKeyCredential("your-api-key");

const client = new VoiceLiveClient(端点, credential);
```

## Client Hierarchy

```
VoiceLiveClient
└── VoiceLiveSession (WebSocket connection)
    ├── updateSession()      → Configure 会话 options
    ├── subscribe()          → Event handlers (Azure SDK pattern)
    ├── sendAudio()          → Stream audio input
    ├── addConversationItem() → Add messages/function outputs
    └── sendEvent()          → Send raw protocol events
```

## 快速开始

```typescript
import { DefaultAzureCredential } from "@azure/identity";
import { VoiceLiveClient } from "@azure/ai-voicelive";

const credential = new DefaultAzureCredential();
const 端点 = process.env.AZURE_VOICELIVE_ENDPOINT!;

// Create client and start 会话
const client = new VoiceLiveClient(端点, credential);
const 会话 = await client.startSession("gpt-4o-mini-realtime-preview");

// Configure 会话
await 会话.updateSession({
  modalities: ["text", "audio"],
  使用说明: "You are a helpful AI assistant. Respond naturally.",
  voice: {
    type: "azure-standard",
    name: "en-US-AvaNeural",
  },
  turnDetection: {
    type: "server_vad",
    threshold: 0.5,
    prefixPaddingMs: 300,
    silenceDurationMs: 500,
  },
  inputAudioFormat: "pcm16",
  outputAudioFormat: "pcm16",
});

// Subscribe to events
const subscription = 会话.subscribe({
  onResponseAudioDelta: async (event, context) => {
    // Handle streaming audio output
    const audioData = event.delta;
    playAudioChunk(audioData);
  },
  onResponseTextDelta: async (event, context) => {
    // Handle streaming text
    process.stdout.write(event.delta);
  },
  onInputAudioTranscriptionCompleted: async (event, context) => {
    console.log("User said:", event.transcript);
  },
});

// Send audio from microphone
function sendAudioChunk(audioBuffer: ArrayBuffer) {
  会话.sendAudio(audioBuffer);
}
```

## 会话 配置

```typescript
await 会话.updateSession({
  // Modalities
  modalities: ["audio", "text"],
  
  // System 使用说明
  使用说明: "You are a customer service representative.",
  
  // Voice selection
  voice: {
    type: "azure-standard",  // or "azure-custom", "openai"
    name: "en-US-AvaNeural",
  },
  
  // Turn detection (VAD)
  turnDetection: {
    type: "server_vad",      // or "azure_semantic_vad"
    threshold: 0.5,
    prefixPaddingMs: 300,
    silenceDurationMs: 500,
  },
  
  // Audio formats
  inputAudioFormat: "pcm16",
  outputAudioFormat: "pcm16",
  
  // Tools (function calling)
  tools: [
    {
      type: "function",
      name: "get_weather",
      description: "Get current weather",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string" }
        },
        required: ["location"]
      }
    }
  ],
  toolChoice: "auto",
});
```

## Event Handling (Azure SDK Pattern)

The SDK uses a subscription-based event handling pattern:

```typescript
const subscription = 会话.subscribe({
  // Connection lifecycle
  onConnected: async (args, context) => {
    console.log("Connected:", args.connectionId);
  },
  onDisconnected: async (args, context) => {
    console.log("Disconnected:", args.code, args.reason);
  },
  onError: async (args, context) => {
    console.error("Error:", args.error.message);
  },
  
  // 会话 events
  onSessionCreated: async (event, context) => {
    console.log("会话 created:", context.sessionId);
  },
  onSessionUpdated: async (event, context) => {
    console.log("会话 updated");
  },
  
  // Audio input events (VAD)
  onInputAudioBufferSpeechStarted: async (event, context) => {
    console.log("Speech started at:", event.audioStartMs);
  },
  onInputAudioBufferSpeechStopped: async (event, context) => {
    console.log("Speech stopped at:", event.audioEndMs);
  },
  
  // Transcription events
  onConversationItemInputAudioTranscriptionCompleted: async (event, context) => {
    console.log("User said:", event.transcript);
  },
  onConversationItemInputAudioTranscriptionDelta: async (event, context) => {
    process.stdout.write(event.delta);
  },
  
  // 响应 events
  onResponseCreated: async (event, context) => {
    console.log("响应 started");
  },
  onResponseDone: async (event, context) => {
    console.log("响应 complete");
  },
  
  // Streaming text
  onResponseTextDelta: async (event, context) => {
    process.stdout.write(event.delta);
  },
  onResponseTextDone: async (event, context) => {
    console.log("\n--- Text complete ---");
  },
  
  // Streaming audio
  onResponseAudioDelta: async (event, context) => {
    const audioData = event.delta;
    playAudioChunk(audioData);
  },
  onResponseAudioDone: async (event, context) => {
    console.log("Audio complete");
  },
  
  // Audio transcript (what assistant said)
  onResponseAudioTranscriptDelta: async (event, context) => {
    process.stdout.write(event.delta);
  },
  
  // Function calling
  onResponseFunctionCallArgumentsDone: async (event, context) => {
    if (event.name === "get_weather") {
      const args = JSON.parse(event.arguments);
      const result = await getWeather(args.location);
      
      await 会话.addConversationItem({
        type: "function_call_output",
        callId: event.callId,
        output: JSON.stringify(result),
      });
      
      await 会话.sendEvent({ type: "响应.create" });
    }
  },
  
  // Catch-all for debugging
  onServerEvent: async (event, context) => {
    console.log("Event:", event.type);
  },
});

// Clean up when done
await subscription.close();
```

## Function Calling

```typescript
// Define tools in 会话 config
await 会话.updateSession({
  modalities: ["audio", "text"],
  使用说明: "Help users with weather information.",
  tools: [
    {
      type: "function",
      name: "get_weather",
      description: "Get current weather for a location",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City and state or country",
          },
        },
        required: ["location"],
      },
    },
  ],
  toolChoice: "auto",
});

// Handle function calls
const subscription = 会话.subscribe({
  onResponseFunctionCallArgumentsDone: async (event, context) => {
    if (event.name === "get_weather") {
      const args = JSON.parse(event.arguments);
      const weatherData = await fetchWeather(args.location);
      
      // Send function result
      await 会话.addConversationItem({
        type: "function_call_output",
        callId: event.callId,
        output: JSON.stringify(weatherData),
      });
      
      // Trigger 响应 generation
      await 会话.sendEvent({ type: "响应.create" });
    }
  },
});
```

## Voice Options

| Voice Type | Config | Example |
|------------|--------|---------|
| Azure Standard | `{ type: "azure-standard", name: "..." }` | `"en-US-AvaNeural"` |
| Azure Custom | `{ type: "azure-custom", name: "...", endpointId: "..." }` | Custom voice 端点 |
| Azure Personal | `{ type: "azure-personal", speakerProfileId: "..." }` | Personal voice clone |
| OpenAI | `{ type: "openai", name: "..." }` | `"alloy"`, `"echo"`, `"shimmer"` |

## Supported Models

| Model | Description | Use Case |
|-------|-------------|----------|
| `gpt-4o-realtime-preview` | GPT-4o with real-time audio | High-quality conversational AI |
| `gpt-4o-mini-realtime-preview` | Lightweight GPT-4o | Fast, efficient interactions |
| `phi4-mm-realtime` | Phi multimodal | Cost-effective applications |

## Turn Detection Options

```typescript
// Server VAD (default)
turnDetection: {
  type: "server_vad",
  threshold: 0.5,
  prefixPaddingMs: 300,
  silenceDurationMs: 500,
}

// Azure Semantic VAD (smarter detection)
turnDetection: {
  type: "azure_semantic_vad",
}

// Azure Semantic VAD (English optimized)
turnDetection: {
  type: "azure_semantic_vad_en",
}

// Azure Semantic VAD (Multilingual)
turnDetection: {
  type: "azure_semantic_vad_multilingual",
}
```

## Audio Formats

| Format | Sample Rate | Use Case |
|--------|-------------|----------|
| `pcm16` | 24kHz | 默认, high quality |
| `pcm16-8000hz` | 8kHz | Telephony |
| `pcm16-16000hz` | 16kHz | Voice assistants |
| `g711_ulaw` | 8kHz | Telephony (US) |
| `g711_alaw` | 8kHz | Telephony (EU) |

## 关键类型参考

| Type | Purpose |
|------|---------|
| `VoiceLiveClient` | Main client for creating sessions |
| `VoiceLiveSession` | Active WebSocket 会话 |
| `VoiceLiveSessionHandlers` | Event handler interface |
| `VoiceLiveSubscription` | Active event subscription |
| `Connection上下文` | 上下文 for connection events |
| `会话上下文` | 上下文 for 会话 events |
| `ServerEventUnion` | Union of all server events |

## 错误处理

```typescript
import {
  VoiceLiveError,
  VoiceLiveConnectionError,
  VoiceLiveAuthenticationError,
  VoiceLiveProtocolError,
} from "@azure/ai-voicelive";

const subscription = 会话.subscribe({
  onError: async (args, context) => {
    const { error } = args;
    
    if (error instanceof VoiceLiveConnectionError) {
      console.error("Connection error:", error.message);
    } else if (error instanceof VoiceLiveAuthenticationError) {
      console.error("Auth error:", error.message);
    } else if (error instanceof VoiceLiveProtocolError) {
      console.error("Protocol error:", error.message);
    }
  },
  
  onServerError: async (event, context) => {
    console.error("Server error:", event.error?.message);
  },
});
```

## 日志

```typescript
import { setLogLevel } from "@azure/logger";

// Enable verbose logging
setLogLevel("info");

// Or via environment variable
// AZURE_LOG_LEVEL=info
```

## Browser 用法

```typescript
// Browser requires bundler (Vite, webpack, etc.)
import { VoiceLiveClient } from "@azure/ai-voicelive";
import { InteractiveBrowserCredential } from "@azure/identity";

// Use browser-compatible credential
const credential = new InteractiveBrowserCredential({
  clientId: "your-client-id",
  tenantId: "your-tenant-id",
});

const client = new VoiceLiveClient(端点, credential);

// 请求 microphone access
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const audioContext = new AudioContext({ sampleRate: 24000 });

// Process audio and send to 会话
// ... (see samples for full implementation)
```

## 最佳实践

1. **始终 use `默认AzureCredential`** — 绝不 hardcode API keys
2. **Set both modalities** — Include `["text", "audio"]` for voice assistants
3. **Use Azure Semantic VAD** — Better turn detection than basic server VAD
4. **Handle all error types** — Connection, auth, and protocol errors
5. **Clean up subscriptions** — Call `subscription.close()` when done
6. **Use appropriate audio format** — PCM16 at 24kHz for best quality

## 参考链接

| Resource | URL |
|----------|-----|
| npm Package | https://www.npmjs.com/package/@azure/ai-voicelive |
| GitHub Source | https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/ai/ai-voicelive |
| Samples | https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/ai/ai-voicelive/samples |
| API Reference | https://learn.microsoft.com/javascript/api/@azure/ai-voicelive |

## 使用场景
This skill is applicable to execute the 工作流 or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
