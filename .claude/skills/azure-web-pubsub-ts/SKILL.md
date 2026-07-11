---
name: 指导 TypeScript 开发者使用 Azure Web PubSub 客户端库实现实时消息传递。
description: "指导 TypeScript 开发者使用 Azure Web PubSub 客户端库实现实时消息传递。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# Azure Web PubSub TypeScript SDK

Real-time messaging with WebSocket connections and pub/sub patterns.

## 安装

```bash
# Server-side management
npm install @azure/web-pubsub @azure/identity

# Client-side real-time messaging
npm install @azure/web-pubsub-client

# Express middleware for event handlers
npm install @azure/web-pubsub-express
```

## 环境变量

```bash
WEBPUBSUB_CONNECTION_STRING=端点=https://<resource>.webpubsub.azure.com;AccessKey=<key>;Version=1.0;
WEBPUBSUB_ENDPOINT=https://<resource>.webpubsub.azure.com
```

## Server-Side: WebPubSubServiceClient

### Authentication

```typescript
import { WebPubSubServiceClient, AzureKeyCredential } from "@azure/web-pubsub";
import { DefaultAzureCredential } from "@azure/identity";

// Connection string
const client = new WebPubSubServiceClient(
  process.env.WEBPUBSUB_CONNECTION_STRING!,
  "chat"  // hub name
);

// DefaultAzureCredential (recommended)
const client2 = new WebPubSubServiceClient(
  process.env.WEBPUBSUB_ENDPOINT!,
  new DefaultAzureCredential(),
  "chat"
);

// AzureKeyCredential
const client3 = new WebPubSubServiceClient(
  process.env.WEBPUBSUB_ENDPOINT!,
  new AzureKeyCredential("<access-key>"),
  "chat"
);
```

### Generate Client Access 令牌

```typescript
// Basic 令牌
const 令牌 = await client.getClientAccessToken();
console.log(令牌.url);  // wss://...?access_token=...

// 令牌 with user ID
const userToken = await client.getClientAccessToken({
  userId: "user123",
});

// 令牌 with permissions
const permToken = await client.getClientAccessToken({
  userId: "user123",
  roles: [
    "webpubsub.joinLeaveGroup",
    "webpubsub.sendToGroup",
    "webpubsub.sendToGroup.chat-room",  // specific group
  ],
  groups: ["chat-room"],  // auto-join on connect
  expirationTimeInMinutes: 60,
});
```

### Send Messages

```typescript
// Broadcast to all connections in hub
await client.sendToAll({ message: "Hello everyone!" });
await client.sendToAll("Plain text", { contentType: "text/plain" });

// Send to specific user (all their connections)
await client.sendToUser("user123", { message: "Hello!" });

// Send to specific connection
await client.sendToConnection("connectionId", { data: "Direct message" });

// Send with 过滤器 (OData syntax)
await client.sendToAll({ message: "Filtered" }, {
  过滤器: "userId ne 'admin'",
});
```

### Group Management

```typescript
const group = client.group("chat-room");

// Add user/connection to group
await group.addUser("user123");
await group.addConnection("connectionId");

// Remove from group
await group.removeUser("user123");

// Send to group
await group.sendToAll({ message: "Group message" });

// Close all connections in group
await group.closeAllConnections({ reason: "Maintenance" });
```

### Connection Management

```typescript
// Check existence
const userExists = await client.userExists("user123");
const connExists = await client.connectionExists("connectionId");

// Close connections
await client.closeConnection("connectionId", { reason: "Kicked" });
await client.closeUserConnections("user123");
await client.closeAllConnections();

// Permissions
await client.grantPermission("connectionId", "sendToGroup", { targetName: "chat" });
await client.revokePermission("connectionId", "sendToGroup", { targetName: "chat" });
```

## Client-Side: WebPubSubClient

### Connect

```typescript
import { WebPubSubClient } from "@azure/web-pubsub-client";

// Direct URL
const client = new WebPubSubClient("<client-access-url>");

// Dynamic URL from negotiate 端点
const client2 = new WebPubSubClient({
  getClientAccessUrl: async () => {
    const 响应 = await fetch("/negotiate");
    const { url } = await 响应.json();
    return url;
  },
});

// Register handlers BEFORE starting
client.on("connected", (e) => {
  console.log(`Connected: ${e.connectionId}`);
});

client.on("group-message", (e) => {
  console.log(`${e.message.group}: ${e.message.data}`);
});

await client.start();
```

### Send Messages

```typescript
// Join group first
await client.joinGroup("chat-room");

// Send to group
await client.sendToGroup("chat-room", "Hello!", "text");
await client.sendToGroup("chat-room", { type: "message", content: "Hi" }, "json");

// Send options
await client.sendToGroup("chat-room", "Hello", "text", {
  noEcho: true,        // Don't echo back to sender
  fireAndForget: true, // Don't wait for ack
});

// Send event to server
await client.sendEvent("userAction", { action: "typing" }, "json");
```

### Event Handlers

```typescript
// Connection lifecycle
client.on("connected", (e) => {
  console.log(`Connected: ${e.connectionId}, User: ${e.userId}`);
});

client.on("disconnected", (e) => {
  console.log(`Disconnected: ${e.message}`);
});

client.on("stopped", () => {
  console.log("Client stopped");
});

// Messages
client.on("group-message", (e) => {
  console.log(`[${e.message.group}] ${e.message.fromUserId}: ${e.message.data}`);
});

client.on("server-message", (e) => {
  console.log(`Server: ${e.message.data}`);
});

// Rejoin failure
client.on("rejoin-group-failed", (e) => {
  console.log(`Failed to rejoin ${e.group}: ${e.error}`);
});
```

## Express Event Handler

```typescript
import express from "express";
import { WebPubSubEventHandler } from "@azure/web-pubsub-express";

const app = express();

const handler = new WebPubSubEventHandler("chat", {
  path: "/api/webpubsub/hubs/chat/",
  
  // Blocking: approve/reject connection
  handleConnect: (req, res) => {
    if (!req.claims?.sub) {
      res.fail(401, "Authentication required");
      return;
    }
    res.success({
      userId: req.claims.sub[0],
      groups: ["general"],
      roles: ["webpubsub.sendToGroup"],
    });
  },
  
  // Blocking: handle custom events
  handleUserEvent: (req, res) => {
    console.log(`Event from ${req.context.userId}:`, req.data);
    res.success(`Received: ${req.data}`, "text");
  },
  
  // Non-blocking
  onConnected: (req) => {
    console.log(`Client connected: ${req.context.connectionId}`);
  },
  
  onDisconnected: (req) => {
    console.log(`Client disconnected: ${req.context.connectionId}`);
  },
});

app.use(handler.getMiddleware());

// Negotiate 端点
app.get("/negotiate", async (req, res) => {
  const 令牌 = await serviceClient.getClientAccessToken({
    userId: req.user?.id,
  });
  res.json({ url: 令牌.url });
});

app.listen(8080);
```

## Key Types

```typescript
// Server
import {
  WebPubSubServiceClient,
  WebPubSubGroup,
  GenerateClientTokenOptions,
  HubSendToAllOptions,
} from "@azure/web-pubsub";

// Client
import {
  WebPubSubClient,
  WebPubSubClientOptions,
  OnConnectedArgs,
  OnGroupDataMessageArgs,
} from "@azure/web-pubsub-client";

// Express
import {
  WebPubSubEventHandler,
  ConnectRequest,
  UserEventRequest,
  ConnectResponseHandler,
} from "@azure/web-pubsub-express";
```

## 最佳实践

1. **Use Entra ID auth** - `DefaultAzureCredential` for production
2. **Register handlers before start** - Don't miss initial events
3. **Use groups for channels** - Organize messages by topic/room
4. **Handle reconnection** - Client auto-reconnects by default
5. **Validate in handleConnect** - Reject unauthorized connections early
6. **Use noEcho** - Prevent message echo back to sender when needed

## 使用场景
This skill is applicable to execute the 工作流 or actions described in the overview.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
