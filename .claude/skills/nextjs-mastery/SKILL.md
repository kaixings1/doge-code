---
name: nextjs-mastery
description: Next.js 精通 — App Router 模式，包括 RSC、ISR、中间件、服务端操作和流式渲染。
---

# Next.js 精通
## App Router 结构
```
app/
 layout.tsx # 根布局（包装所有页面）
 page.tsx # 首页路由 /
 loading.tsx # 路由级 Suspense 回退
 error.tsx # 路由级错误边界
 not-found.tsx # 自定义 404
 (marketing)/
 about/page.tsx # /about（分组，无 URL 段）
 dashboard/
 layout.tsx # /dashboard/* 的嵌套布局
 page.tsx # /dashboard
 @analytics/page.tsx # 并行路由插槽
 @activity/page.tsx # 并行路由插槽
 settings/
 page.tsx # /dashboard/settings
 api/
 webhooks/route.ts # 路由处理器（POST /api/webhooks）
```
路由组 `(name)` 组织代码而不影响 URL。并行路由 `@slot` 同时渲染多个页面。

## 服务器组件和数据获取
```tsx
async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 const product = await db.product.findUnique({ where: { id } });
 if (!product) notFound();
 return (
 <div>
 <h1>{product.name}</h1>
 <p>{product.description}</p>
 <Suspense fallback={<ReviewsSkeleton />}>
 <Reviews productId={id} />
 </Suspense>
 </div>
 );
}
async function Reviews({ productId }: { productId: string }) {
 const reviews = await db.review.findMany({ where: { productId } });
 return (
 <ul>
 {reviews.map(r => <li key={r.id}>{r.text} - {r.rating}/5</li>)}
 </ul>
 );
}
```
服务器组件是默认模式。它们在服务器上运行，可以直接访问数据库，并且向客户端发送零 JavaScript。

## ISR 和缓存
```tsx
export const revalidate = 3600;
async function BlogPage() {
 const posts = await fetch("https://api.example.com/posts", {
 next: { revalidate: 3600, tags: ["posts"] },
 }).then(r => r.json());
 return <PostList posts={posts} />;
}
```
```tsx
import { revalidateTag, revalidatePath } from "next/cache";
export async function createPost(formData: FormData) {
 'use server';
 await db.post.create({ data: { title: formData.get("title") as string } });
 revalidateTag("posts");
 revalidatePath("/blog");
}
```
## 中间件
```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
export function middleware(request: NextRequest) {
 const token = request.cookies.get("session")?.value;
 if (request.nextUrl.pathname.startsWith("/dashboard") && !token) {
 return NextResponse.redirect(new URL("/login", request.url));
 }
 const response = NextResponse.next();
 response.headers.set("x-request-id", crypto.randomUUID());
 return response;
}
export const config = {
 matcher: ["/dashboard/:path*", "/api/:path*"],
};
```
中间件在每个匹配的请求之前在边缘运行。保持轻量。

## 服务器操作
```tsx
import { z } from "zod";
import { revalidatePath } from "next/cache";
const schema = z.object({
 email: z.string().email(),
 name: z.string().min(2).max(100),
});
export async function updateProfile(prevState: any, formData: FormData) {
 const parsed = schema.safeParse(Object.fromEntries(formData));
 if (!parsed.success) { return { errors: parsed.error.flatten().fieldErrors }; }
 await db.user.update({ where: { email: parsed.data.email }, data: { name: parsed.data.name } });
 revalidatePath("/profile");
 return { success: true };
}
```

## 反模式
- 在顶层布局或页面组件中添加 'use client'
- 在可以在服务器组件中完成时在客户端获取数据
- 使用 useEffect 进行数据获取而不是服务器组件或 use()
- 不用 Suspense 包裹慢的异步组件
- 在中间件中放置重逻辑（它在每个匹配的请求上运行）
- 忽略 loading.tsx 和 error.tsx 约定

## 检查清单
- [ ] 默认使用服务器组件；仅在交互叶子节点使用 'use client'
- [ ] 数据获取在服务器组件中完成，并带有适当的缓存
- [ ] Suspense 边界包裹独立的异步区域
- [ ] 关键路由存在 loading.tsx 和 error.tsx
- [ ] 中间件轻量，仅处理认证/重定向/头部
- [ ] 服务器操作在数据库写入前使用 Zod 验证输入
- [ ] 变更后调用 revalidateTag 或 revalidatePath
- [ ] 使用路由组和并行路由组织复杂布局