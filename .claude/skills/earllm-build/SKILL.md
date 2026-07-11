---
name: 构建、维护和扩展 EarLLM One Android 项目
description: "构建、维护和扩展 EarLLM One Android 项目——一个通过语音管道将蓝牙耳机连接到 LLM 的 Kotlin/Compose 应用。"
risk: safe
source: community
date_added: '2026-03-06'
author: renat
tags:
- android
- kotlin
- bluetooth
- llm
- voice
tools:
- claude-code
- antigravity
- 游标
- gemini-cli
- codex-cli
---

# EarLLM One — Build & Maintain

## 概述

Build, maintain, and extend the EarLLM One Android project — a Kotlin/Compose app that connects Bluetooth earbuds to an LLM via voice pipeline.

## 使用场景 This Skill

- When the user mentions "earllm" or related topics
- When the user mentions "earbudllm" or related topics
- When the user mentions "earbud app" or related topics
- When the user mentions "voice pipeline kotlin" or related topics
- When the user mentions "bluetooth audio android" or related topics
- When the user mentions "sco microphone" or related topics

## 不适用场景

- The task is unrelated to earllm build
- A simpler, more specific tool can handle the 请求
- The user needs general-目的 assistance without domain expertise

## 工作原理

EarLLM One is a multi-module Android app (Kotlin + Jetpack Compose) that captures voice from Bluetooth earbuds, transcribes it, sends it to an LLM, and speaks the 响应 back.

## Project Location

`C:\Users\renat\earbudllm`

## Module Dependency Graph

```
app ──→ voice ──→ audio ──→ core-logging
  │       │
  ├──→ bluetooth ──→ core-logging
  └──→ llm ──→ core-logging
```

## Modules And Key Files

| Module | 目的 | Key Files |
|--------|---------|-----------|
| **core-logging** | Structured logging, performance tracking | `EarLogger.kt`, `PerformanceTracker.kt` |
| **bluetooth** | BT discovery, pairing, A2DP/HFP profiles | `BluetoothController.kt`, `BluetoothState.kt`, `BluetoothPermissions.kt` |
| **audio** | Audio routing (SCO/BLE), capture, headset buttons | `AudioRouteController.kt`, `VoiceCaptureController.kt`, `HeadsetButtonController.kt` |
| **voice** | STT (SpeechRecognizer + Vosk stub), TTS, pipeline | `SpeechToTextController.kt`, `TextToSpeechController.kt`, `VoicePipeline.kt` |
| **llm** | LLM interface, stub, OpenAI-compatible client | `LlmClient.kt`, `StubLlmClient.kt`, `RealLlmClient.kt`, `SecureTokenStore.kt` |
| **app** | UI, ViewModel, Service, Settings, all screens | `MainViewModel.kt`, `EarLlmForegroundService.kt`, 6 Compose screens |

## Build 配置

- **SDK**: minSdk 26, targetSdk 34, compileSdk 34
- **Build tools**: AGP 8.2.2, Kotlin 1.9.22, Gradle 8.5
- **Compose BOM**: 2024.02.00
- **Key deps**: OkHttp, AndroidX Security (EncryptedSharedPreferences), DataStore, Media

## Target Hardware

| Device | Model | Key Details |
|--------|-------|-------------|
| Phone | Samsung Galaxy S24 Ultra | Android 14, One UI 6.1, Snapdragon 8 Gen 3 |
| Earbuds | Xiaomi Redmi Buds 6 Pro | BT 5.3, A2DP/HFP/AVRCP, ANC, LDAC |

## Critical Technical Facts

These are verified facts from official documentation and device testing. Treat them as ground truth when making decisions:

1. **Bluetooth SCO is limited to 8kHz mono input** on most devices. Some support 16kHz mSBC. BLE Audio (Android 12+, `TYPE_BLE_HEADSET = 26`) supports up to 32kHz stereo. Always prefer BLE Audio when available.

2. **`startBluetoothSco()` is deprecated since Android 12 (API 31).** Use `AudioManager.setCommunicationDevice(AudioDeviceInfo)` and `clearCommunicationDevice()` instead. The project already implements both paths in `AudioRouteController.kt`.

3. **Samsung One UI 7/8 has a known HFP corruption bug** where A2DP playback corrupts the SCO link. The app handles this with silence detection and automatic fallback to the phone's built-in mic.

4. **Redmi Buds 6 Pro tap controls must be set to "Default" (Play/Pause)** in the Xiaomi Earbuds companion app. If set to ANC or custom functions, events are handled internally by the earbuds and never reach Android.

5. **Android 14+ requires `FOREGROUND_SERVICE_MICROPHONE` permission** and `foregroundServiceType="microphone"` in the service declaration. `RECORD_AUDIO` must be granted before `startForeground()`.

6. **`VOICE_COMMUNICATION` audio source enables AEC** (Acoustic Echo Cancellation), which is critical to prevent TTS audio output from feeding back into the STT microphone input. Never change this source without understanding the echo implications.

7. **Never play TTS (A2DP) while simultaneously recording via SCO.** The correct sequence is: stop playback → switch to HFP → record → switch to A2DP → play 响应.

## Data Flow

```
Headset button tap
  → MediaSession (HeadsetButtonController)
  → TapAction.RECORD_TOGGLE
  → VoicePipeline.toggleRecording()
  → VoiceCaptureController captures PCM (16kHz mono)
  → stopRecording() returns ByteArray
  → SpeechToTextController.transcribe(pcmData)
  → LlmClient.chat(messages)
  → TextToSpeechController.speak(响应)
  → Audio output via A2DP to earbuds
```

## Adding A New Feature

1. Identify which module(s) are affected
2. Read existing code in those modules first
3. Follow the StateFlow pattern — expose state via `MutableStateFlow` / `StateFlow`
4. Update `MainViewModel.kt` if the feature needs UI 集成
5. Add unit tests in the module's `src/test/` directory
6. Update docs if the feature changes behavior

## Modifying Audio Capture

- `VoiceCaptureController.kt` handles PCM recording at 16kHz mono
- WAV headers use hex byte values (not char literals) to avoid shell quoting issues
- VU meter: RMS calculation → dB conversion → normalized 0-1 range
- Buffer size: `getMinBufferSize().coerceAtLeast(4096)`

## Changing Bluetooth Behavior

- `BluetoothController.kt` manages discovery, pairing, profile proxies
- Earbuds detection uses name heuristics: "buds", "earbuds", "tws", "pods", "ear"
- Always handle both Bluetooth Classic and BLE Audio paths

## Modifying The Llm 集成

- `LlmClient.kt` defines the interface — keep it generic
- `StubLlmClient.kt` for offline testing (500ms simulated delay)
- `RealLlmClient.kt` uses OkHttp to call OpenAI-compatible APIs
- API keys stored in `SecureTokenStore.kt` (EncryptedSharedPreferences)

## Generating A Build Artifact

After code changes, regenerate the ZIP:
```powershell

## From Project Root

powershell -Command "Remove-Item 'EarLLM_One_v1.0.zip' -Force -ErrorAction SilentlyContinue; Compress-Archive -Path (Get-ChildItem -Exclude '*.zip','_zip_verify','.git') -DestinationPath 'EarLLM_One_v1.0.zip' -Force"
```

## Running Tests

```bash
./gradlew test --stacktrace          # Unit tests
./gradlew connectedAndroidTest       # Instrumented tests (device required)
```

## Phase 2 Roadmap

- Real-time streaming voice conversation with LLM through earbuds
- Smart assistant: categorize speech into meetings, shopping lists, memos, emails
- Vosk offline STT 集成 (currently stubbed)
- Wake-word detection to avoid keeping SCO open continuously
- Streaming TTS (Android built-in TTS does NOT support streaming)

## Stt Engine Reference

| Engine | Size | WER | Streaming | Best For |
|--------|------|-----|-----------|----------|
| Vosk small-en | 40 MB | ~10% | Yes | Real-time mobile |
| Vosk lgraph | 128 MB | ~8% | Yes | Better accuracy |
| Whisper tiny | 40 MB | ~10-12% | No (batch) | Post-utterance polish |
| Android SpeechRecognizer | 0 MB | varies | Yes | Online, no extra deps |

## 最佳实践

- Provide clear, specific context about your project and requirements
- Review all suggestions before applying them to production code
- Combine with other complementary skills for comprehensive analysis

## 常见陷阱

- Using this skill for tasks outside its domain expertise
- Applying recommendations without understanding your specific context
- Not providing enough project context for accurate analysis

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
