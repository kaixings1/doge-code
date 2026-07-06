---
name: frontend-excellence
description: 前端卓越 — React服务器组件、性能优化、可访问性和现代CSS的前端模式。
---

# 前端卓越

## React 服务器组件

服务器组件在服务器上运行并将渲染的 HTML 发送到客户端。它们可以直接访问数据库、文件系统和内部 API，而无需将其暴露给浏览器。

```tsx
// app/products/page.tsx（默认为服务器组件）
async function ProductsPage() {
  const products = await db.查询("SELECT * FROM products WHERE active = true");
  return (
    <main>
      <h1>产品</h1>
      <ProductList products={products} />
      <AddToCartButton />  {/* 客户端组件 */}
    </main>
  );
}
```

规则：
- 服务器组件不能使用 `useState`、`useEffect` 或浏览器 API
- 在文件顶部使用 `'use client'` 标记交互式组件
- 从服务器组件向客户端组件传递可序列化的属性（无函数，无类）
- 尽可能将 `'use client'` 边界保持在树的深层

## 流式 SSR

```tsx
import { Suspense } from 'react';

export default function Dashboard() {
  return (
    <div>
      <Header />  {/* 立即渲染 */}
      <Suspense fallback={<ChartSkeleton />}>
        <AnalyticsChart />  {/* 准备就绪时流式传输 */}
      </Suspense>
      <Suspense fallback={<TableSkeleton />}>
        <RecentOrders />  {/* 独立流式传输 */}
      </Suspense>
    </div>
  );
}
```

每个 `Suspense` 边界独立流式传输。将边界放在数据获取组件周围，以避免阻塞整个页面。

## 代码拆分

```tsx
import dynamic from 'next/dynamic';

const HeavyEditor = dynamic(() => import('@/components/Editor'), {
  loading: () => <EditorSkeleton />,
  ssr: false,
});

const AdminPanel = dynamic(() => import('@/components/AdminPanel'));
```

拆分时机：
- 路由边界（Next.js App Router 中自动）
- 条件渲染的组件（模态框、抽屉、管理面板）
- 重型库（图表库、富文本编辑器、地图）
- 首屏以下内容

## 包优化

```javascript
// next.config.js
module.exports = {
  experimental: {
    optimizePackageImports: ['lucide-react', '@heroicons/react', 'lodash-es'],
  },
};
```

清单：
- 运行 `npx next build` 并查看每个路由的输出大小
- 使用 `@next/bundle-analyzer` 识别大型依赖项
- 将 `moment` 替换为 `date-fns` 或 `dayjs`（节省约 200KB）
- 导入特定函数：`import { debounce } from 'lodash-es/debounce'`
- 优先使用 CSS 而不是 JS 进行动画（无运行时成本）
- 摇树优化图标库：`import { Search } from 'lucide-react'`

## 核心 Web 指标目标

| 指标 | 良好 | 需要改进 | 差 |
|--------|------|------------|------|
| LCP（最大内容绘制） | <2.5秒 | 2.5-4.0秒 | >4.0秒 |
| INP（交互到下一次绘制） | <200毫秒 | 200-500毫秒 | >500毫秒 |
| CLS（累积布局偏移） | <0.1 | 0.1-0.25 | >0.25 |

## LCP 优化

- 预加载英雄图像：`<link rel="preload" as="image" href="..." />`
- 在首屏 `<Image>` 组件上使用 `priority` 属性
- 内联关键 CSS，延迟非关键样式表
- 避免对首屏内容进行客户端渲染
- 在图像上设置明确的 `width`/`height` 以防止布局偏移

## 图像优化

```tsx
import Image from 'next/image';

<Image
  src="/hero.jpg"
  alt="描述性替代文本"
  width={1200}
  height={630}
  priority              // 为 LCP 图像预加载
  sizes="(max-width: 768px) 100vw, 50vw"
  placeholder="blur"
  blurDataURL={base64}  // 内联微小占位符
/>
```

- 使用 `next/image` 或等效工具（自动 WebP/AVIF，响应式 srcset）
- 设置 `sizes` 属性以避免下载过大的图像
- 使用 `placeholder="blur"` 和 base64 数据 URL 以获得感知性能
- 延迟加载首屏以下图像（默认行为）

## 字体加载策略

```tsx
// app/layout.tsx
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',       // 立即显示回退字体
  preload: true,
  variable: '--font-inter',
});

export default function RootLayout({ children }) {
  return (
    <html className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

- 使用 `next/font` 实现零 CLS 字体加载和自动子集化
- 设置 `display: 'swap'` 以避免加载期间文本不可见
- 自托管字体而不是从 Google CDN 加载（节省 DNS 查找）
- 最多限制为 2 个字体家族

## CLS 预防

- 始终在图像和视频上设置 `width` 和 `height`
- 使用 `aspect-ratio` CSS 实现响应式媒体容器
- 使用 `min-height` 为动态内容（广告、嵌入）预留空间
- 避免在加载后向现有内容上方插入内容
- 对大小变化的组件使用 CSS `contain: layout`

## 性能监控

```typescript
import { onCLS, onINP, onLCP } from 'web-vitals';

onCLS(console.log);
onINP(console.log);
onLCP(console.log);
```

测量真实用户指标（RUM），而不仅仅是实验室分数。Vercel Analytics 和 Google Search Console 提供现场数据。
