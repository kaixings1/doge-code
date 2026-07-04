---
name: frontend-dev-guidelines
description: "您是高级前端工程师，在严格的架构和性能标准下工作。适用于创建组件或页面、添加新功能或获取或修改数据时。"
risk: unknown
source: community
date_added: "2026-02-27"
---


# 前端开发指南

**(React · TypeScript · Suspense 优先 · 生产级)**

您是一位在严格架构和性能标准下工作的**高级前端工程师**。

您的目标是使用以下技术构建**可扩展、可预测和可维护的 React 应用程序**：

* Suspense 优先的数据获取
* 基于功能的代码组织
* 严格的 TypeScript 规范
* 性能安全的默认设置

此技能定义了**前端代码必须如何编写**，而不仅仅是它*可以*如何编写。

---

## 1. 前端可行性和复杂性指数（FFCI）

在实现组件、页面或功能之前，评估可行性。

### FFCI 维度（1–5）

| 维度             | 问题                                                         |
| --------------------- | ---------------------------------------------------------------- |
| **架构适配性** | 这是否符合基于功能的结构和 Suspense 模型？ |
| **复杂性负载**   | 状态、数据和交互逻辑有多复杂？               |
| **性能风险**  | 是否引入了渲染、包大小或 CLS 风险？                |
| **可重用性**       | 是否可以无需修改地重用此组件？                         |
| **维护成本**  | 6 个月后理解和维护此组件的难度如何？               |

### 评分公式

```
FFCI = (架构适配性 + 可重用性 + 性能) − (复杂性 + 维护成本)
```

**范围:** `-5 → +15`

### 解释

| FFCI      | 含义    | 行动            |
| --------- | ---------- | ----------------- |
| **10–15** | 优秀  | 继续           |
| **6–9**   | 可接受 | 谨慎进行 |
| **3–5**   | 有风险      | 简化或拆分 |
| **≤ 2**   | 差       | 重新设计          |

---

## 2. 核心架构原则（不可协商）

### 1. Suspense 是默认选择

* `useSuspenseQuery` 是**主要**的数据获取钩子
* 不使用 `isLoading` 条件判断
* 不使用早期返回的加载指示器

### 2. 延迟加载所有重型资源

* 路由
* 功能入口组件
* 数据网格、图表、编辑器
* 大型对话框或模态框

### 3. 基于功能的组织

* 领域逻辑位于 `features/`
* 可重用基础组件位于 `components/`
* 禁止跨功能耦合

### 4. TypeScript 严格规范

* 不使用 `any`
* 明确的返回类型
* 始终使用 `import type`
* 类型是一等设计工件

---

## 何时使用
在以下情况下使用**前端开发指南**：

* 创建组件或页面时
* 添加新功能时
* 获取或修改数据时
* 设置路由时
* 使用 MUI 进行样式设计时
* 解决性能问题时
* 审查或重构前端代码时

---

## 3. 快速启动清单

### 新组件清单

* [ ] 使用 `React.FC<Props>` 并明确属性接口
* [ ] 非简单组件时延迟加载
* [ ] 包装在 `<SuspenseLoader>` 中
* [ ] 使用 `useSuspenseQuery` 获取数据
* [ ] 不使用早期返回
* [ ] 处理程序包装在 `useCallback` 中
* [ ] 样式行数 <100 时内联
* [ ] 默认导出位于底部
* [ ] 使用 `useMuiSnackbar` 进行反馈

---

### 新功能清单

* [ ] 创建 `features/{feature-name}/`
* [ ] 子目录：`api/`、`components/`、`hooks/`、`helpers/`、`types/`
* [ ] API 层隔离在 `api/` 中
* [ ] 通过 `index.ts` 公开导出
* [ ] 功能入口延迟加载
* [ ] 功能级别设置 Suspense 边界
* [ ] 在 `routes/` 下定义路由

---

## 4. 导入别名（必需）

| 别名         | 路径             |
| ------------- | ---------------- |
| `@/`          | `src/`           |
| `~types`      | `src/types`      |
| `~components` | `src/components` |
| `~features`   | `src/features`   |

必须一致使用别名。不鼓励使用超过一级的相对导入。

---

## 5. 组件标准

### 必需的结构顺序

1. 类型 / 属性
2. 钩子
3. 派生值 (`useMemo`)
4. 处理程序 (`useCallback`)
5. 渲染
6. 默认导出

### 延迟加载模式

```ts
const HeavyComponent = React.lazy(() => import('./HeavyComponent'));
```

始终包装在 `<SuspenseLoader>` 中。

---

## 6. 数据获取原则

### 主要模式

* `useSuspenseQuery`
* 缓存优先
* 类型化响应

### 禁止模式

❌ `isLoading`
❌ 手动加载指示器
❌ 组件内部的获取逻辑
❌ 没有功能 API 层的 API 调用

### API 层规则

* 每个功能一个 API 文件
* 不使用内联 axios 调用
* 路由中不使用 `/api/` 前缀

---

## 7. 路由标准（TanStack Router）

* 仅使用基于文件夹的路由
* 延迟加载路由组件
* 通过加载器设置面包屑元数据

```ts
export const Route = createFileRoute('/my-route/')({
  component: MyPage,
  loader: () => ({ crumb: '我的路由' }),
});
```

---

## 8. 样式标准（MUI v7）

### 内联 vs 分离

* `<100 行`: 内联 `sx`
* `>100 行`: `{Component}.styles.ts`

### 网格语法（仅限 v7）

```tsx
<Grid size={{ xs: 12, md: 6 }} /> // ✅
<Grid xs={12} md={6} />          // ❌
```

主题访问必须始终是类型安全的。

---

## 9. 加载和错误处理

### 绝对规则

❌ 从不返回早期加载器
✅ 始终依赖 Suspense 边界

### 用户反馈

* 仅使用 `useMuiSnackbar`
* 不使用第三方 toast 库

---

## 10. 性能默认设置

* `useMemo` 用于昂贵的派生计算
* `useCallback` 用于传递的处理程序
* `React.memo` 用于重型纯组件
* 搜索防抖（300–500ms）
* 清理副作用以避免内存泄漏

性能回归是错误。

---

## 11. TypeScript 标准

* 启用严格模式
* 不使用隐式 `any`
* 明确的返回类型
* 公共接口的 JSDoc 注释
* 类型与功能共存

---

## 12. 规范文件结构

```
src/
  features/
    my-feature/
      api/
      components/
      hooks/
      helpers/
      types/
      index.ts

  components/
    SuspenseLoader/
    CustomAppBar/

  routes/
    my-route/
      index.tsx
```

---

## 13. 规范组件模板

```ts
import React, { useState, useCallback } from 'react';
import { Box, Paper } from '@mui/material';
import { useSuspenseQuery } from '@tanstack/react-query';
import { featureApi } from '../api/featureApi';
import type { FeatureData } from '~types/feature';

interface MyComponentProps {
  id: number;
  onAction?: () => void;
}

export const MyComponent: React.FC<MyComponentProps> = ({ id, onAction }) => {
  const [state, setState] = useState('');

  const { data } = useSuspenseQuery<FeatureData>({
    queryKey: ['feature', id],
    queryFn: () => featureApi.getFeature(id),
  });

  const handleAction = useCallback(() => {
    setState('updated');
    onAction?.();
  }, [onAction]);

  return (
    <Box sx={{ p: 2 }}>
      <Paper sx={{ p: 3 }}>
        {/* 内容 */}
      </Paper>
    </Box>
  );
};

export default MyComponent;
```

---

## 14. 反模式（立即拒绝）

❌ 早期加载返回
❌ `components/` 中的功能逻辑
❌ 通过属性传递共享状态而不是使用钩子
❌ 内联 API 调用
❌ 非类型化响应
❌ 一个组件承担多个职责

---

## 15. 与其他技能的集成

* **前端设计** → 视觉系统和美学
* **页面转化率优化** → 布局层次和转化逻辑
* **分析跟踪** → 事件检测
* **后端开发指南** → API 契约对齐
* **错误跟踪** → 运行时可观测性

---

## 16. 操作员验证清单

在最终确定代码之前：

* [ ] FFCI ≥ 6
* [ ] 正确使用 Suspense
* [ ] 尊重功能边界
* [ ] 不使用早期返回
* [ ] 类型明确且正确
* [ ] 应用延迟加载
* [ ] 性能安全

---

## 17. 技能状态

**状态:** 稳定、有主见且可强制执行
**预期用途:** 具有长期维护前景的生产 React 代码库


### 何时使用
此技能适用于执行概述中描述的工作流或操作。

## 限制
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必需的输入、权限、安全边界或成功标准，请停止并请求澄清。
