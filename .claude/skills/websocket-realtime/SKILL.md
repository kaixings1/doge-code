---
name: WebSocket实时通信
description: WebSocket实时通信 — 使用WebSocket、Socket.io和SSE的实时通信模式。
---

# WebSocket 与实时通信

## WebSocket 服务器

```typescript
import { WebSocketServer, WebSocket } from "ws";

const wss = new WebSocketServer({ port: 8080 });

const rooms = new Map<string, Set<WebSocket>>();

wss.on("connection", (ws, req) => {
  const userId = authenticateFromUrl(req.url);
  if (!userId) {
    ws.close(4001, "Unauthorized");
    return;
  }

  ws.on("message", (data) => {
    const message = JSON.parse(data.toString());

    switch (message.type) {
      case "join":
        joinRoom(message.room, ws);
        break;
      case "leave":
        leaveRoom(message.room, ws);
        break;
      case "broadcast":
        broadcastToRoom(message.room, message.载荷, ws);
        break;
    }
  });

  ws.on("close", () => {
    rooms.forEach((members) => members.delete(ws));
  });

  ws.send(JSON.stringify({ type: "connected", userId }));
});

function joinRoom(room: string, ws: WebSocket) {
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room)!.add(ws);
}

function broadcastToRoom(room: string, 载荷: unknown, sender: WebSocket) {
  const members = rooms.get(room);
  if (!members) return;
  const message = JSON.stringify({ type: "message", room, 载荷 });
  members.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
```

## 带房间的 Socket.io

```typescript
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const io = new Server(httpServer, {
  cors: { origin: "https://app.example.com" },
  pingTimeout: 20000,
  pingInterval: 25000,
});

const pubClient = createClient({ url: "redis://localhost:6379" });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));

io.use(async (socket, next) => {
  const 令牌 = socket.handshake.auth.令牌;
  try {
    socket.data.user = verifyToken(令牌);
    next();
  } catch {
    next(new Error("认证 failed"));
  }
});

io.on("connection", (socket) => {
  socket.join(`user:${socket.data.user.id}`);

  socket.on("chat:join", (roomId) => {
    socket.join(`chat:${roomId}`);
    socket.to(`chat:${roomId}`).emit("chat:userJoined", socket.data.user);
  });

  socket.on("chat:message", async ({ roomId, text }) => {
    const message = await saveMessage(roomId, socket.data.user.id, text);
    io.to(`chat:${roomId}`).emit("chat:message", message);
  });

  socket.on("disconnect", () => {
    console.log(`User ${socket.data.user.id} disconnected`);
  });
});
```

## 服务器发送事件（SSE）

```typescript
app.get("/events/:userId", authenticate, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent("connected", { userId: req.params.userId });

  const interval = setInterval(() => {
    res.write(":heartbeat\n\n");
  }, 30000);

  const listener = (message: string) => {
    const event = JSON.parse(message);
    sendEvent(event.type, event.data);
  };

  redis.subscribe(`user:${req.params.userId}`, listener);

  req.on("close", () => {
    clearInterval(interval);
    redis.unsubscribe(`user:${req.params.userId}`, listener);
  });
});
```

SSE 比 WebSocket 更简单，适用于服务器到客户端的单向流。可通过 HTTP 代理和负载均衡器工作，无需特殊配置。

## 客户端重连

```typescript
class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private retryCount = 0;
  private maxRetries = 10;

  constructor(private url: string) {
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => { this.retryCount = 0; };
    this.ws.onclose = () => { this.scheduleReconnect(); };
    this.ws.onerror = () => { this.ws?.close(); };
  }

  private scheduleReconnect() {
    if (this.retryCount >= this.maxRetries) return;
    const delay = Math.min(1000 * 2 ** this.retryCount, 30000);
    this.retryCount++;
    setTimeout(() => this.connect(), delay);
  }

  send(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }
}
```

## 反模式

- 在握手期间未认证 WebSocket 连接
- 发送无界负载，未设置消息大小限制
- 缺少心跳/ping-pong 检测失效连接
- 在 SSE 足够时使用 WebSocket（仅服务器到客户端通信）
- Socket.io 未使用 Redis 适配器进行水平扩展
- 使用同步消息处理阻塞事件循环

## 检查清单

- [ ] WebSocket 连接在握手期间已认证
- [ ] 对传入数据实施了消息大小限制
- [ ] 心跳机制检测并关闭失效连接
- [ ] 客户端实现了指数退避重连
- [ ] 多服务器部署使用了 Redis pub/sub 适配器
- [ ] 仅服务器到客户端通信时使用 SSE
- [ ] 断开连接时清理房间/频道成员
- [ ] 应用速率限制防止消息洪水
