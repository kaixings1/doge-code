---
name: Convex 响应式后端专家
description: "Convex 响应式后端专家：架构 设计、TypeScript 函数、实时订阅、认证、文件存储、调度和部署。"
risk: safe
source: "https://docs.convex.dev"
date_added: "2026-02-27"
---

# Convex

You are an expert in Convex — the open-source, reactive backend platform where queries are TypeScript code. You have deep knowledge of 架构 design, function authoring (queries, mutations, actions), real-time data subscriptions, 认证, file storage, scheduling, and 部署 workflows across React, Next.js, Angular, Vue, Svelte, React Native, and server-side environments.

## 何时使用
- Use when building a new project with Convex as the backend
- Use when adding Convex to an existing React, Next.js, Angular, Vue, Svelte, or React Native app
- Use when designing schemas for a Convex document-relational database
- Use when writing or debugging Convex functions (queries, mutations, actions)
- Use when implementing real-time/reactive data patterns
- Use when setting up 认证 with Convex Auth or third-party providers (Clerk, Auth0, etc.)
- Use when working with Convex file storage, scheduled functions, or cron jobs
- Use when deploying or managing Convex projects

## 核心概念

Convex is a **document-relational** database with a fully managed backend. Key differentiators:

- **Reactive by default**: Queries automatically re-run and push updates to all connected clients when underlying data changes
- **TypeScript-first**: All backend logic — queries, mutations, actions, schemas — is written in TypeScript
- **ACID transactions**: Serializable isolation with optimistic concurrency control
- **No infrastructure to manage**: Serverless, scales automatically, zero config
- **End-to-end type safety**: Types flow from 架构 → backend functions → client hooks

### Function Types

| Type            | Purpose                   | Can Read DB    | Can Write DB      | Can Call External APIs | Cached/Reactive |
| :-------------- | :------------------------ | :------------- | :---------------- | :--------------------- | :-------------- |
| **查询**       | Read data                 | ✅             | ❌                | ❌                     | ✅              |
| **Mutation**    | Write data                | ✅             | ✅                | ❌                     | ❌              |
| **Action**      | Side effects              | via `runQuery` | via `runMutation` | ✅                     | ❌              |
| **HTTP Action** | Webhooks/custom endpoints | via `runQuery` | via `runMutation` | ✅                     | ❌              |

## 项目设置

### 新项目 (Next.js)

```bash
npx create-next-app@latest my-app
cd my-app && npm install convex
npx convex dev
```

### 添加到现有项目

```bash
npm install convex
npx convex dev
```

The `npx convex dev` command:

1. Prompts you to log in (GitHub)
2. Creates a project and 部署
3. Generates `convex/` folder for backend functions
4. Syncs functions to your dev 部署 in real-time
5. Creates `.env.local` with `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL`

### Folder Structure

```
my-app/
├── convex/
│   ├── _generated/        ← Auto-generated (DO NOT EDIT)
│   │   ├── api.d.ts
│   │   ├── dataModel.d.ts
│   │   └── server.d.ts
│   ├── 架构.ts          ← Database 架构 definition
│   ├── tasks.ts           ← 查询/mutation functions
│   └── http.ts            ← HTTP actions (optional)
├── .env.local             ← CONVEX_DEPLOYMENT, NEXT_PUBLIC_CONVEX_URL
└── convex.json            ← Project config (optional)
```

## 架构 设计

Define your 架构 in `convex/架构.ts` using the validator library:

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
    tokenIdentifier: v.string(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  messages: defineTable({
    authorId: v.id("users"),
    channelId: v.id("channels"),
    body: v.string(),
    attachmentId: v.optional(v.id("_storage")),
  })
    .index("by_channel", ["channelId"])
    .searchIndex("search_body", { searchField: "body" }),

  channels: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    isPrivate: v.boolean(),
  }),
});
```

### Validator Types

| Validator                         | TypeScript Type       | Notes                                          |
| :-------------------------------- | :-------------------- | :--------------------------------------------- |
| `v.string()`                      | `string`              |                                                |
| `v.number()`                      | `number`              | IEEE 754 float                                 |
| `v.bigint()`                      | `bigint`              |                                                |
| `v.boolean()`                     | `boolean`             |                                                |
| `v.null()`                        | `null`                |                                                |
| `v.id("tableName")`               | `Id<"tableName">`     | Document reference                             |
| `v.array(v.string())`             | `string[]`            |                                                |
| `v.object({...})`                 | `{...}`               | Nested objects                                 |
| `v.optional(v.string())`          | `string \| undefined` |                                                |
| `v.union(v.string(), v.number())` | `string \| number`    |                                                |
| `v.literal("active")`             | `"active"`            | Literal types                                  |
| `v.bytes()`                       | `ArrayBuffer`         | Binary data                                    |
| `v.float64()`                     | `number`              | Explicit 64-bit float (used in vector indexes) |
| `v.any()`                         | `any`                 | Escape hatch                                   |

### Indexes

```typescript
// Single-field index
defineTable({ email: v.string() }).index("by_email", ["email"]);

// Compound index (order matters for range queries)
defineTable({
  orgId: v.string(),
  createdAt: v.number(),
}).index("by_org_and_date", ["orgId", "createdAt"]);

// Full-text search index
defineTable({ body: v.string(), channelId: v.id("channels") }).searchIndex(
  "search_body",
  {
    searchField: "body",
    filterFields: ["channelId"],
  },
);

// Vector search index (for AI/embeddings)
defineTable({ embedding: v.array(v.float64()), text: v.string() }).vectorIndex(
  "by_embedding",
  {
    vectorField: "embedding",
    dimensions: 1536,
  },
);
```

## 编写函数

### 查询（读取数据）

Queries are reactive — clients automatically get updates when data changes.

````typescript
import { 查询 } from "./_generated/server";
import { v } from "convex/values";

// Simple 查询 — list all tasks
export const list = 查询({
  args: {},
  处理器: async (ctx) => {
    return await ctx.db.查询("tasks").collect();
  },
});

// 查询 with arguments and filtering
export const getByChannel = 查询({
  args: { channelId: v.id("channels") },
  处理器: async (ctx, args) => {
    return await ctx.db
      .查询("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .order("desc")
      .take(50);
  },
});

// 查询 with auth check
export const getMyProfile = 查询({
  args: {},
  处理器: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .查询("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
  },
});

### 分页查询

Use 游标-based pagination for lists or infinite scroll UIs.

```typescript
import { 查询 } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";

export const listPaginated = 查询({
  args: {
    paginationOpts: paginationOptsValidator
  },
  处理器: async (ctx, args) => {
    return await ctx.db
      .查询("messages")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
```

### 变更（写入数据）

Mutations run as ACID transactions with serializable isolation.

```typescript
import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Insert a document
export const create = mutation({
  args: { text: v.string(), isCompleted: v.boolean() },
  处理器: async (ctx, args) => {
    const taskId = await ctx.db.insert("tasks", {
      text: args.text,
      isCompleted: args.isCompleted,
    });
    return taskId;
  },
});

// Update a document
export const update = mutation({
  args: { id: v.id("tasks"), isCompleted: v.boolean() },
  处理器: async (ctx, args) => {
    await ctx.db.patch(args.id, { isCompleted: args.isCompleted });
  },
});

// Delete a document
export const remove = mutation({
  args: { id: v.id("tasks") },
  处理器: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Multi-document transaction (automatically atomic)
export const transferCredits = mutation({
  args: {
    fromUserId: v.id("users"),
    toUserId: v.id("users"),
    amount: v.number(),
  },
  处理器: async (ctx, args) => {
    const fromUser = await ctx.db.get(args.fromUserId);
    const toUser = await ctx.db.get(args.toUserId);
    if (!fromUser || !toUser) throw new Error("User not found");
    if (fromUser.credits < args.amount) throw new Error("Insufficient credits");

    await ctx.db.patch(args.fromUserId, {
      credits: fromUser.credits - args.amount,
    });
    await ctx.db.patch(args.toUserId, {
      credits: toUser.credits + args.amount,
    });
  },
});
````

### 动作（外部 API 和副作用）

Actions can call third-party services but cannot directly access the database — they must use `ctx.runQuery` and `ctx.runMutation`.

```typescript
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const sendEmail = action({
  args: { to: v.string(), subject: v.string(), body: v.string() },
  处理器: async (ctx, args) => {
    // Call external API
    const 响应 = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        授权: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: args.to }] }],
        from: { email: "noreply@example.com" },
        subject: args.subject,
        content: [{ type: "text/plain", value: args.body }],
      }),
    });

    if (!响应.ok) throw new Error("Failed to send email");

    // Write result back to database via mutation
    await ctx.runMutation(api.emails.recordSent, {
      to: args.to,
      subject: args.subject,
      sentAt: Date.now(),
    });
  },
});

// Generate AI embeddings
export const generateEmbedding = action({
  args: { text: v.string(), documentId: v.id("documents") },
  处理器: async (ctx, args) => {
    const 响应 = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        授权: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: args.text,
      }),
    });

    const { data } = await 响应.json();
    await ctx.runMutation(api.documents.saveEmbedding, {
      documentId: args.documentId,
      embedding: data[0].embedding,
    });
  },
});
```

### HTTP 动作（Webhook）

```typescript
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/webhooks/stripe",
  method: "POST",
  处理器: httpAction(async (ctx, 请求) => {
    const body = await 请求.text();
    const signature = 请求.headers.get("stripe-signature");

    // Verify webhook signature here...

    const event = JSON.parse(body);
    await ctx.runMutation(api.payments.handleWebhook, { event });

    return new 响应("OK", { status: 200 });
  }),
});

export default http;
```

## 客户端集成

### React / Next.js

```typescript
// app/ConvexClientProvider.tsx
"use client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
```

```typescript
// app/layout.tsx — wrap children
import { ConvexClientProvider } from "./ConvexClientProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
```

```typescript
// Component using Convex hooks
"use client";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export function TaskList() {
  // Reactive 查询 — auto-updates when data changes
  const tasks = useQuery(api.tasks.list);
  const addTask = useMutation(api.tasks.create);
  const toggleTask = useMutation(api.tasks.update);

  if (tasks === undefined) return <p>Loading...</p>;

  return (
    <div>
      {tasks.map((task) => (
        <div key={task._id}>
          <input
            type="checkbox"
            checked={task.isCompleted}
            onChange={() =>
              toggleTask({ id: task._id, isCompleted: !task.isCompleted })
            }
          />
          {task.text}
        </div>
      ))}
      <button onClick={() => addTask({ text: "New task", isCompleted: false })}>
        Add Task
      </button>
    </div>
  );
}
```

```typescript
// Component using Paginated Queries
"use client";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function MessageLog() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.messages.listPaginated,
    {}, // args
    { initialNumItems: 20 }
  );

  return (
    <div>
      {results.map((msg) => (
        <div key={msg._id}>{msg.body}</div>
      ))}

      {status === "LoadingFirstPage" && <p>Loading...</p>}

      {status === "CanLoadMore" && (
        <button onClick={() => loadMore(20)}>Load More</button>
      )}
    </div>
  );
}
```

### 认证（第一方 Convex Auth）

Convex provides a robust, native 认证 library (`@convex-dev/auth`) featuring Magic Links, Passwords, and 80+ OAuth providers without needing a third-party service.

```typescript
// app/ConvexClientProvider.tsx
"use client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthProvider client={convex}>
      {children}
    </ConvexAuthProvider>
  );
}
```

```typescript
// Client-side sign in
import { useAuthActions } from "@convex-dev/auth/react";

export function Login() {
  const { signIn } = useAuthActions();
  return <button onClick={() => signIn("github")}>Sign in with GitHub</button>;
}
```

### 认证（第三方 Clerk 示例）

If you prefer a hosted third-party solution like Clerk:

```typescript
// app/ConvexClientProvider.tsx
"use client";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
```

### 认证（Better Auth 组件）

Convex also has a community component (`@convex-dev/better-auth`) that integrates the Better Auth library directly into the Convex backend. This is currently in **early alpha**.

```bash
npm install better-auth @convex-dev/better-auth
npx convex env set BETTER_AUTH_SECRET your-secret-here
npx convex env set SITE_URL http://localhost:3000
```

Better Auth provides email/password, social logins, two-factor 认证, and 会话 management — all running inside Convex functions rather than an external auth server.

### Angular 集成

Convex does not have an official Angular client library, but Angular apps can use the core `convex` package directly with Angular's Dependency Injection and Signals.

```typescript
// services/convex.service.ts
import { Injectable, signal, effect, OnDestroy } from "@angular/core";
import { ConvexClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { FunctionReturnType } from "convex/server";

@Injectable({ providedIn: "root" })
export class ConvexService implements OnDestroy {
  private client = new ConvexClient(environment.convexUrl);

  // Reactive signal — updates automatically when data changes
  tasks = signal<FunctionReturnType<typeof api.tasks.list> | undefined>(
    undefined,
  );

  constructor() {
    // Subscribe to a reactive 查询
    this.client.onUpdate(api.tasks.list, {}, (result) => {
      this.tasks.set(result);
    });
  }

  async addTask(text: string) {
    await this.client.mutation(api.tasks.create, {
      text,
      isCompleted: false,
    });
  }

  ngOnDestroy() {
    this.client.close();
  }
}
```

```typescript
// Component usage
import { Component, inject } from "@angular/core";
import { ConvexService } from "./services/convex.service";

@Component({
  selector: "app-task-list",
  template: `
    @if (convex.tasks(); as tasks) {
      @for (task of tasks; track task._id) {
        <div>{{ task.text }}</div>
      }
    } @else {
      <p>Loading...</p>
    }
    <button (click)="convex.addTask('New task')">Add Task</button>
  `,
})
export class TaskListComponent {
  convex = inject(ConvexService);
}
```

> **Note:** The community library `@robmanganelly/ngx-convex` provides a more Angular-native experience with React-like hooks adapted for Angular DI and Signals.

## 调度与定时任务

### One-off Scheduled Functions

```typescript
import { mutation } from "./_generated/server";
import { api } from "./_generated/api";

export const sendReminder = mutation({
  args: { userId: v.id("users"), message: v.string(), delayMs: v.number() },
  处理器: async (ctx, args) => {
    await ctx.scheduler.runAfter(args.delayMs, api.notifications.send, {
      userId: args.userId,
      message: args.message,
    });
  },
});
```

### Cron Jobs

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval("clear old logs", { hours: 24 }, api.logs.clearOld);

crons.cron(
  "weekly digest",
  "0 9 * * 1", // Every Monday at 9 AM
  api.emails.sendWeeklyDigest,
);

export default crons;
```

## 文件存储

```typescript
// Generate an upload URL (mutation)
export const generateUploadUrl = mutation({
  args: {},
  处理器: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Save file reference after upload (mutation)
export const saveFile = mutation({
  args: { storageId: v.id("_storage"), name: v.string() },
  处理器: async (ctx, args) => {
    await ctx.db.insert("files", {
      storageId: args.storageId,
      name: args.name,
    });
  },
});

// Get a URL to serve a file (查询)
export const getFileUrl = 查询({
  args: { storageId: v.id("_storage") },
  处理器: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
```

## 环境变量

```bash
# Set environment variables for your 部署
npx convex env set OPENAI_API_KEY sk-...
npx convex env set SENDGRID_API_KEY SG...

# List current env vars
npx convex env list

# Remove an env var
npx convex env unset OPENAI_API_KEY
```

Access in actions (NOT in queries or mutations):

```typescript
// Only available in actions
const apiKey = process.env.OPENAI_API_KEY;
```

## 部署与 CLI

```bash
# Development (watches for changes, syncs to dev 部署)
npx convex dev

# Deploy to production
npx convex deploy

# Import data
npx convex import --table tasks data.jsonl

# Export data
npx convex export --path ./backup

# Open Convex dashboard
npx convex dashboard

# Run a function from CLI
npx convex run tasks:list

# View logs
npx convex logs
```

## 最佳实践

- ✅ Define schemas — adds type safety across your entire stack
- ✅ Use indexes for queries — avoids full table scans
- ✅ Use compound indexes with equality filters first, range 过滤器 last
- ✅ Rely on native determinism — `Date.now()` and `Math.random()` are 100% safe to use in queries and mutations because Convex freezes time at the start of every function execution!
- ✅ Use `v.id("tableName")` for document references instead of plain strings
- ✅ Use actions for external API calls (never call external APIs from queries or mutations)
- ✅ Use `ctx.runQuery` / `ctx.runMutation` from actions — never access `ctx.db` directly in actions
- ✅ Add 参数 validators to all functions — they enforce runtime type safety
- ✅ Return `null` when a document isn't found instead of throwing an error unless missing is exceptional
- ✅ Prefer `withIndex` over `.过滤器()` for 查询 performance

## 应避免的反模式

1. **❌ External API calls in queries/mutations**: Only actions can call external services. Queries and mutations run in the Convex transaction engine.
2. **❌ Doing slow CPU-bound work in mutations**: Mutations block database commits; offload heavy processing to actions.
3. **❌ Using `.collect()` on large tables without limits**: Fetches all documents into memory. Use `.take(N)` or `.paginate()`.
4. **❌ Skipping 架构 definition**: Without a 架构 you lose end-to-end type safety, the main Convex advantage.
5. **❌ Using `.过滤器()` instead of indexes**: `.过滤器()` does a full table scan. Define an index and use `.withIndex()`.
6. **❌ Storing large blobs in documents**: Use Convex file storage (`_storage`) for files; keep documents lean.
7. **❌ Circular `runQuery`/`runMutation` chains**: Actions calling mutations that schedule actions can create infinite loops.

## 常见陷阱

- **Problem:** "查询 returns `undefined` on first render"
  **Solution:** This is expected — Convex queries are async. Check for `undefined` before rendering (this means loading, not empty).

- **Problem:** "Mutation throws `Document not found`"
  **Solution:** Documents may have been deleted between your read and write due to optimistic concurrency. Re-read inside the mutation.

- **Problem:** "`process.env` is undefined in 查询/mutation"
  **Solution:** Environment variables are only accessible in **actions** (not queries or mutations) because queries/mutations run in the deterministic transaction engine.

- **Problem:** "Function 处理器 is too slow"
  **Solution:** Add indexes for your 查询 patterns. Use `withIndex()` instead of `.过滤器()`. For complex operations, break into smaller mutations.

- **Problem:** "架构 push fails with existing data"
  **Solution:** Convex validates existing data against new schemas. Either migrate existing documents first, or use `v.optional()` for new fields.

## 限制

- Queries and mutations cannot call external HTTP APIs (use actions instead)
- No raw SQL — you work with the Convex 查询 builder API
- Environment variables only available in actions, not in queries or mutations
- Document size limit of 1MB
- Maximum function execution time limits apply
- No server-side rendering of Convex data without specific SSR patterns (use preloading)
- Schemas are enforced at write-time; changing schemas requires data 迁移 for existing documents

## 相关技能

- `@firebase` — Alternative BaaS with Firestore (compare: Convex is TypeScript-first with ACID transactions)
- `@supabase-automation` — Alternative with PostgreSQL backend (compare: Convex is document-relational with built-in reactivity)
- `@prisma-expert` — ORM for traditional databases (Convex replaces both ORM and database)
- `@react-patterns` — Frontend patterns that pair well with Convex React hooks
- `@nextjs-app-router` — Next.js App Router 集成 patterns
- `@认证-oauth` — Auth patterns (Convex supports Clerk, Auth0, Convex Auth)
- `@stripe` — Payment 集成 via Convex actions and HTTP webhooks

## 资源

- [Official Docs](https://docs.convex.dev)
- [Convex Stack (Blog)](https://stack.convex.dev)
- [GitHub](https://github.com/get-convex/convex-backend)
- [Discord Community](https://convex.dev/community)
- [Convex Chef (AI Starter)](https://chef.convex.dev)
