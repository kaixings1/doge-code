---
name: 性能优化
description: 性能优化 — 打包分析、懒加载、缓存策略、Core Web Vitals和CDN配置。
---

# 性能优化

## 打包分析与代码分割

```typescript
// Dynamic import for route-level code splitting
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}
```

```javascript
// vite.config.ts - manual chunk splitting
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          charts: ["recharts", "d3"],
          editor: ["@monaco-editor/react"],
        },
      },
    },
  },
});
```

```bash
# Analyze bundle composition
npx vite-bundle-visualizer
npx source-map-explorer dist/assets/*.js
```

## 图片优化

```tsx
import Image from "next/image";

function ProductImage({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={800}
      height={600}
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      placeholder="blur"
      blurDataURL={generateBlurHash(src)}
      loading="lazy"
    />
  );
}
```

```html
<!-- Native lazy loading with aspect ratio -->
<img
  src="product.webp"
  alt="Product photo"
  width="800"
  height="600"
  loading="lazy"
  decoding="async"
  fetchpriority="low"
/>

<!-- Preload LCP image -->
<link rel="preload" as="image" href="/hero.webp" fetchpriority="high" />
```

## 缓存头配置

```typescript
function setCacheHeaders(res: 响应, options: CacheOptions) {
  if (options.immutable) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }

  if (options.revalidate) {
    res.setHeader("Cache-Control", `public, max-age=0, s-maxage=${options.revalidate}, stale-while-revalidate=${options.staleWhileRevalidate ?? 86400}`);
    return;
  }

  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
}

app.use("/assets", (req, res, next) => {
  setCacheHeaders(res, { immutable: true });
  next();
});

app.use("/api", (req, res, next) => {
  setCacheHeaders(res, { revalidate: 60, staleWhileRevalidate: 3600 });
  next();
});
```

## 大数据虚拟列表

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 5,
  });

  return (
    <div ref={parentRef} style={{ height: "600px", overflow: "auto" }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: "absolute",
              top: 0,
              transform: `translateY(${virtualRow.start}px)`,
              height: `${virtualRow.size}px`,
              width: "100%",
            }}
          >
            <ItemRow item={items[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Core Web Vitals 监控

```typescript
import { onCLS, onINP, onLCP } from "web-vitals";

function sendMetric(metric: { name: string; value: number; id: string }) {
  navigator.sendBeacon("/api/vitals", JSON.stringify(metric));
}

onCLS(sendMetric);
onINP(sendMetric);
onLCP(sendMetric);
```

- **LCP** (Largest Contentful Paint): < 2.5s。预加载主图，优化服务器响应时间。
- **INP** (Interaction to Next Paint): < 200ms。避免长任务，使用 `requestIdleCallback`。
- **CLS** (Cumulative Layout Shift): < 0.1。为图片和内嵌内容设置显式尺寸。

## 反模式

- 一次性加载所有 JavaScript 而非按路由代码分割
- 服务未优化的图片（无 WebP/AVIF，无响应式尺寸）
- 图片缺少 `width` 和 `height`（导致布局偏移）
- 对带有内容哈希的静态资源使用 `Cache-Control: no-cache`
- 渲染数千个 DOM 节点而非使用虚拟列表
- 使用同步计算阻塞主线程

## 检查清单

- [ ] 路由使用动态 `import()` 和 Suspense 懒加载
- [ ] 打包已分析，vendor 块已分离
- [ ] 图片以 WebP/AVIF 格式提供并带有响应式 `sizes` 属性
- [ ] LCP 图片已预加载并设置 `fetchpriority="high"`
- [ ] 静态资源使用不可变头信息和内容哈希缓存
- [ ] 100+ 项的列表使用虚拟化
- [ ] 生产环境监控 Core Web Vitals（LCP, INP, CLS）
- [ ] 关键渲染路径中无阻塞渲染的资源
