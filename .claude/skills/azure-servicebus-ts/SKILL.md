---
name: azure-servicebus-ts
description: "指导 TypeScript 开发者使用 Azure Service Bus 客户端库实现消息队列和发布/订阅。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# Azure Service Bus SDK for TypeScript

Enterprise messaging with queues, topics, and subscriptions.

## 安装

```bash
npm install @azure/service-bus @azure/identity
```

## 环境变量

```bash
SERVICEBUS_NAMESPACE=<namespace>.servicebus.windows.net
SERVICEBUS_QUEUE_NAME=my-queue
SERVICEBUS_TOPIC_NAME=my-topic
SERVICEBUS_SUBSCRIPTION_NAME=my-subscription
```

## 认证

```typescript
import { ServiceBusClient } from "@azure/service-bus";
import { DefaultAzureCredential } from "@azure/identity";

const fullyQualifiedNamespace = process.env.SERVICEBUS_NAMESPACE!;
const client = new ServiceBusClient(fullyQualifiedNamespace, new DefaultAzureCredential());
```

## 核心工作流

### Send Messages to Queue

```typescript
const sender = client.createSender("my-queue");

// Single message
await sender.sendMessages({
  body: { orderId: "12345", amount: 99.99 },
  contentType: "application/json",
});

// Batch messages
const batch = await sender.createMessageBatch();
batch.tryAddMessage({ body: "Message 1" });
batch.tryAddMessage({ body: "Message 2" });
await sender.sendMessages(batch);

await sender.close();
```

### Receive Messages from Queue

```typescript
const receiver = client.createReceiver("my-queue");

// Receive batch
const messages = await receiver.receiveMessages(10, { maxWaitTimeInMs: 5000 });
for (const message of messages) {
  console.log(`Received: ${message.body}`);
  await receiver.completeMessage(message);
}

await receiver.close();
```

### Subscribe to Messages (Event-Driven)

```typescript
const receiver = client.createReceiver("my-queue");

const subscription = receiver.subscribe({
  processMessage: async (message) => {
    console.log(`Processing: ${message.body}`);
    // Message auto-completed on success
  },
  processError: async (args) => {
    console.error(`Error: ${args.error}`);
  },
});

// Stop after some time
setTimeout(async () => {
  await subscription.close();
  await receiver.close();
}, 60000);
```

### Topics and Subscriptions

```typescript
// Send to topic
const topicSender = client.createSender("my-topic");
await topicSender.sendMessages({
  body: { event: "order.created", data: { orderId: "123" } },
  applicationProperties: { eventType: "order.created" },
});

// Receive from subscription
const subscriptionReceiver = client.createReceiver("my-topic", "my-subscription");
const messages = await subscriptionReceiver.receiveMessages(10);
```

## Message Sessions

```typescript
// Send 会话 message
const sender = client.createSender("会话-queue");
await sender.sendMessages({
  body: { step: 1, data: "First step" },
  sessionId: "工作流-123",
});

// Receive 会话 messages
const sessionReceiver = await client.acceptSession("会话-queue", "工作流-123");
const messages = await sessionReceiver.receiveMessages(10);

// Get/set 会话 state
const state = await sessionReceiver.getSessionState();
await sessionReceiver.setSessionState(Buffer.from(JSON.stringify({ progress: 50 })));

await sessionReceiver.close();
```

## Dead-Letter Handling

```typescript
// Move to dead-letter
await receiver.deadLetterMessage(message, {
  deadLetterReason: "Validation failed",
  deadLetterErrorDescription: "Missing required field: orderId",
});

// Process dead-letter queue
const dlqReceiver = client.createReceiver("my-queue", { subQueueType: "deadLetter" });
const dlqMessages = await dlqReceiver.receiveMessages(10);
for (const msg of dlqMessages) {
  console.log(`DLQ Reason: ${msg.deadLetterReason}`);
  // Reprocess or log
  await dlqReceiver.completeMessage(msg);
}
```

## Scheduled Messages

```typescript
const sender = client.createSender("my-queue");

// Schedule for future delivery
const scheduledTime = new Date(Date.now() + 60000); // 1 minute from now
const sequenceNumber = await sender.scheduleMessages(
  { body: "Delayed message" },
  scheduledTime
);

// Cancel scheduled message
await sender.cancelScheduledMessages(sequenceNumber);
```

## Message Deferral

```typescript
// Defer message for later
await receiver.deferMessage(message);

// Receive deferred message by sequence number
const deferredMessage = await receiver.receiveDeferredMessages(message.sequenceNumber!);
await receiver.completeMessage(deferredMessage[0]);
```

## Peek Messages (Non-Destructive)

```typescript
const receiver = client.createReceiver("my-queue");

// Peek without removing
const peekedMessages = await receiver.peekMessages(10);
for (const msg of peekedMessages) {
  console.log(`Peeked: ${msg.body}`);
}
```

## Key Types

```typescript
import {
  ServiceBusClient,
  ServiceBusSender,
  ServiceBusReceiver,
  ServiceBusSessionReceiver,
  ServiceBusMessage,
  ServiceBusReceivedMessage,
  ProcessMessageCallback,
  ProcessErrorCallback,
} from "@azure/service-bus";
```

## Receive Modes

```typescript
// Peek-Lock (default) - message locked until completed/abandoned
const receiver = client.createReceiver("my-queue", { receiveMode: "peekLock" });
await receiver.completeMessage(message);   // Remove from queue
await receiver.abandonMessage(message);    // Return to queue
await receiver.deferMessage(message);      // Defer for later
await receiver.deadLetterMessage(message); // Move to DLQ

// Receive-and-Delete - message removed immediately
const receiver = client.createReceiver("my-queue", { receiveMode: "receiveAndDelete" });
```

## 最佳实践

1. **Use Entra ID auth** - Avoid connection strings in production
2. **Reuse clients** - Create `ServiceBusClient` once, share across senders/receivers
3. **Close 资源** - 始终 close senders/receivers when done
4. **Handle errors** - Implement `processError` callback for subscription receivers
5. **Use sessions for ordering** - When message order matters within a group
6. **Configure dead-letter** - 始终 handle DLQ messages
7. **Batch sends** - Use `createMessageBatch()` for multiple messages

## Reference Documentation

For detailed patterns, see:

- Queues vs Topics Patterns - Queue/topic patterns, sessions, receive modes, message settlement
- Error Handling and Reliability - ServiceBusError codes, DLQ handling, lock renewal, graceful shutdown

## 使用场景
This skill is applicable to execute the 工作流 or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
