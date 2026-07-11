---
name: 指导 Java 开发者使用 Azure Communication Chat 客户端库将聊天集成到应用中。
description: "指导 Java 开发者使用 Azure Communication Chat 客户端库将聊天集成到应用中。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# Azure Communication Chat (Java)

Build real-time chat applications with thread management, messaging, participants, and read receipts.

## 安装

```xml
<dependency>
    <groupId>com.azure</groupId>
    <artifactId>azure-communication-chat</artifactId>
    <version>1.6.0</version>
</dependency>
```

## 客户端创建

```java
import com.azure.communication.chat.ChatClient;
import com.azure.communication.chat.ChatClientBuilder;
import com.azure.communication.chat.ChatThreadClient;
import com.azure.communication.common.CommunicationTokenCredential;

// ChatClient requires a CommunicationTokenCredential (user access 令牌)
String 端点 = "https://<resource>.communication.azure.com";
String userAccessToken = "<user-access-令牌>";

CommunicationTokenCredential credential = new CommunicationTokenCredential(userAccessToken);

ChatClient chatClient = new ChatClientBuilder()
    .端点(端点)
    .credential(credential)
    .buildClient();

// Async client
ChatAsyncClient chatAsyncClient = new ChatClientBuilder()
    .端点(端点)
    .credential(credential)
    .buildAsyncClient();
```

## 关键概念

| Class | Purpose |
|-------|---------|
| `ChatClient` | Create/delete chat threads, get thread clients |
| `ChatThreadClient` | Operations within a thread (messages, participants, receipts) |
| `ChatParticipant` | User in a chat thread with display name |
| `ChatMessage` | Message content, type, sender info, timestamps |
| `ChatMessageReadReceipt` | Read receipt tracking per participant |

## Create Chat Thread

```java
import com.azure.communication.chat.models.*;
import com.azure.communication.common.CommunicationUserIdentifier;
import java.util.ArrayList;
import java.util.List;

// Define participants
List<ChatParticipant> participants = new ArrayList<>();

ChatParticipant participant1 = new ChatParticipant()
    .setCommunicationIdentifier(new CommunicationUserIdentifier("<user-id-1>"))
    .setDisplayName("Alice");

ChatParticipant participant2 = new ChatParticipant()
    .setCommunicationIdentifier(new CommunicationUserIdentifier("<user-id-2>"))
    .setDisplayName("Bob");

participants.add(participant1);
participants.add(participant2);

// Create thread
CreateChatThreadOptions options = new CreateChatThreadOptions("Project Discussion")
    .setParticipants(participants);

CreateChatThreadResult result = chatClient.createChatThread(options);
String threadId = result.getChatThread().getId();

// Get thread client for operations
ChatThreadClient threadClient = chatClient.getChatThreadClient(threadId);
```

## Send Messages

```java
// Send text message
SendChatMessageOptions messageOptions = new SendChatMessageOptions()
    .setContent("Hello, team!")
    .setSenderDisplayName("Alice")
    .setType(ChatMessageType.TEXT);

SendChatMessageResult sendResult = threadClient.sendMessage(messageOptions);
String messageId = sendResult.getId();

// Send HTML message
SendChatMessageOptions htmlOptions = new SendChatMessageOptions()
    .setContent("<strong>Important:</strong> Meeting at 3pm")
    .setType(ChatMessageType.HTML);

threadClient.sendMessage(htmlOptions);
```

## Get Messages

```java
import com.azure.core.util.paging.PagedIterable;

// List all messages
PagedIterable<ChatMessage> messages = threadClient.listMessages();

for (ChatMessage message : messages) {
    System.out.println("ID: " + message.getId());
    System.out.println("Type: " + message.getType());
    System.out.println("Content: " + message.getContent().getMessage());
    System.out.println("Sender: " + message.getSenderDisplayName());
    System.out.println("Created: " + message.getCreatedOn());
    
    // Check if edited or deleted
    if (message.getEditedOn() != null) {
        System.out.println("Edited: " + message.getEditedOn());
    }
    if (message.getDeletedOn() != null) {
        System.out.println("Deleted: " + message.getDeletedOn());
    }
}

// Get specific message
ChatMessage message = threadClient.getMessage(messageId);
```

## Update and Delete Messages

```java
// Update message
UpdateChatMessageOptions updateOptions = new UpdateChatMessageOptions()
    .setContent("Updated message content");

threadClient.updateMessage(messageId, updateOptions);

// Delete message
threadClient.deleteMessage(messageId);
```

## Manage Participants

```java
// List participants
PagedIterable<ChatParticipant> participants = threadClient.listParticipants();

for (ChatParticipant participant : participants) {
    CommunicationUserIdentifier user = 
        (CommunicationUserIdentifier) participant.getCommunicationIdentifier();
    System.out.println("User: " + user.getId());
    System.out.println("Display Name: " + participant.getDisplayName());
}

// Add participants
List<ChatParticipant> newParticipants = new ArrayList<>();
newParticipants.add(new ChatParticipant()
    .setCommunicationIdentifier(new CommunicationUserIdentifier("<new-user-id>"))
    .setDisplayName("Charlie")
    .setShareHistoryTime(OffsetDateTime.now().minusDays(7))); // Share last 7 days

threadClient.addParticipants(newParticipants);

// Remove participant
CommunicationUserIdentifier userToRemove = new CommunicationUserIdentifier("<user-id>");
threadClient.removeParticipant(userToRemove);
```

## Read Receipts

```java
// Send read receipt
threadClient.sendReadReceipt(messageId);

// Get read receipts
PagedIterable<ChatMessageReadReceipt> receipts = threadClient.listReadReceipts();

for (ChatMessageReadReceipt receipt : receipts) {
    System.out.println("Message ID: " + receipt.getChatMessageId());
    System.out.println("Read by: " + receipt.getSenderCommunicationIdentifier());
    System.out.println("Read at: " + receipt.getReadOn());
}
```

## Typing Notifications

```java
import com.azure.communication.chat.models.TypingNotificationOptions;

// Send typing notification
TypingNotificationOptions typingOptions = new TypingNotificationOptions()
    .setSenderDisplayName("Alice");

threadClient.sendTypingNotificationWithResponse(typingOptions, Context.NONE);

// Simple typing notification
threadClient.sendTypingNotification();
```

## Thread Operations

```java
// Get thread properties
ChatThreadProperties properties = threadClient.getProperties();
System.out.println("Topic: " + properties.getTopic());
System.out.println("Created: " + properties.getCreatedOn());

// Update topic
threadClient.updateTopic("New Project Discussion Topic");

// Delete thread
chatClient.deleteChatThread(threadId);
```

## List Threads

```java
// List all chat threads for the user
PagedIterable<ChatThreadItem> threads = chatClient.listChatThreads();

for (ChatThreadItem thread : threads) {
    System.out.println("Thread ID: " + thread.getId());
    System.out.println("Topic: " + thread.getTopic());
    System.out.println("Last message: " + thread.getLastMessageReceivedOn());
}
```

## 分页

```java
import com.azure.core.http.rest.PagedResponse;

// Paginate through messages
int maxPageSize = 10;
ListChatMessagesOptions listOptions = new ListChatMessagesOptions()
    .setMaxPageSize(maxPageSize);

PagedIterable<ChatMessage> pagedMessages = threadClient.listMessages(listOptions);

pagedMessages.iterableByPage().forEach(page -> {
    System.out.println("Page status code: " + page.getStatusCode());
    page.getElements().forEach(msg -> 
        System.out.println("Message: " + msg.getContent().getMessage()));
});
```

## 错误处理

```java
import com.azure.core.exception.HttpResponseException;

try {
    threadClient.sendMessage(messageOptions);
} catch (HttpResponseException e) {
    switch (e.getResponse().getStatusCode()) {
        case 401:
            System.out.println("Unauthorized - check 令牌");
            break;
        case 403:
            System.out.println("Forbidden - user not in thread");
            break;
        case 404:
            System.out.println("Thread not found");
            break;
        default:
            System.out.println("Error: " + e.getMessage());
    }
}
```

## Message Types

| Type | Description |
|------|-------------|
| `TEXT` | Regular chat message |
| `HTML` | HTML-formatted message |
| `TOPIC_UPDATED` | System message - topic changed |
| `PARTICIPANT_ADDED` | System message - participant joined |
| `PARTICIPANT_REMOVED` | System message - participant left |

## 环境变量

```bash
AZURE_COMMUNICATION_ENDPOINT=https://<resource>.communication.azure.com
AZURE_COMMUNICATION_USER_TOKEN=<user-access-令牌>
```

## 最佳实践

1. **令牌 Management** - User tokens expire; implement refresh logic with `CommunicationTokenRefreshOptions`
2. **分页** - Use `listMessages(options)` with `maxPageSize` for large threads
3. **Share History** - Set `shareHistoryTime` when adding participants to control message visibility
4. **Message Types** - 过滤器 system messages (`PARTICIPANT_ADDED`, etc.) from user messages
5. **Read Receipts** - Send receipts only when messages are actually viewed by user

## 触发短语

- "chat application Java", "real-time messaging Java"
- "chat thread", "chat participants", "chat messages"
- "read receipts", "typing notifications"
- "Azure Communication Services chat"

## 使用场景
This skill is applicable to execute the 工作流 or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
