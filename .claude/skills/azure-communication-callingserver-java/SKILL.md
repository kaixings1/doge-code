---
name: Azure Communication Calling Server (Java)
description: "Azure Communication Calling Server Java — Azure Communication Calling Server Java SDK 相关功能和最佳实践"
risk: safe
source: community
date_added: "2026-02-27"
---

# Azure Communication CallingServer (Java) - DEPRECATED

> **⚠️ DEPRECATED**: This SDK has been renamed to **Call Automation**. For new projects, use `azure-communication-callautomation` instead. This skill is for maintaining legacy code only.

## 迁移到通话自动化

```xml
<!-- OLD (deprecated) -->
<dependency>
    <groupId>com.azure</groupId>
    <artifactId>azure-communication-callingserver</artifactId>
    <version>1.0.0-beta.5</version>
</dependency>

<!-- NEW (use this instead) -->
<dependency>
    <groupId>com.azure</groupId>
    <artifactId>azure-communication-callautomation</artifactId>
    <version>1.6.0</version>
</dependency>
```

## 类名变更

| CallingServer (Old) | Call Automation (New) |
|---------------------|----------------------|
| `CallingServerClient` | `CallAutomationClient` |
| `CallingServerClientBuilder` | `CallAutomationClientBuilder` |
| `CallConnection` | `CallConnection` (same) |
| `ServerCall` | Removed - use `CallConnection` |

## 旧版客户端创建

```java
// OLD WAY (deprecated)
import com.azure.communication.callingserver.CallingServerClient;
import com.azure.communication.callingserver.CallingServerClientBuilder;

CallingServerClient client = new CallingServerClientBuilder()
    .connectionString("<connection-string>")
    .buildClient();

// NEW WAY
import com.azure.communication.callautomation.CallAutomationClient;
import com.azure.communication.callautomation.CallAutomationClientBuilder;

CallAutomationClient client = new CallAutomationClientBuilder()
    .connectionString("<connection-string>")
    .buildClient();
```

## 旧版录制

```java
// OLD WAY
StartRecordingOptions options = new StartRecordingOptions(serverCallId)
    .setRecordingStateCallbackUri(callbackUri);

StartCallRecordingResult result = client.startRecording(options);
String recordingId = result.getRecordingId();

client.pauseRecording(recordingId);
client.resumeRecording(recordingId);
client.stopRecording(recordingId);

// NEW WAY - see azure-communication-callautomation skill
```

## 新开发建议

**Do not use this SDK for new projects.** 

See the `azure-communication-callautomation-java` skill for:
- Making outbound calls
- Answering incoming calls
- Call recording
- DTMF recognition
- Text-to-speech / speech-to-text
- Adding/removing participants
- Call transfer

## 触发短语

- "callingserver legacy", "deprecated calling SDK"
- "migrate callingserver to callautomation"

## 使用场景
This skill is applicable to execute the 工作流 or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
