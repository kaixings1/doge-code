---
name: frontend-ui-engineering
description: 前端UI工程 — 构建生产质量的UI。在构建或修改UI组件时使用。
---

# 前端 UI 工程

## 概述

构建生产质量的用户界面，这些界面应该是可访问、高性能且视觉上精致的。目标是构建看起来像顶级公司的具有设计意识的工程师构建的 UI —— 而不是像由 AI 生成的 UI。这意味着真正的设计系统遵循、适当的可访问性、深思熟虑的交互模式，以及没有通用的"AI 美学"。

## 何时使用

- 构建新的 UI 组件或页面时
- 修改现有的面向用户的界面时
- 实现响应式布局时
- 添加交互性或状态管理时
- 修复视觉或 UX 问题时

## 组件架构

### 文件结构

将所有与组件相关的内容放在一起：

```
src/components/
  TaskList/
    TaskList.tsx          # 组件实现
    TaskList.test.tsx     # 测试
    TaskList.stories.tsx  # Storybook 故事（如果使用）
    use-task-list.ts      # 自定义 hook（如果状态复杂）
    types.ts              # 组件特定类型（如果需要）
```

### 组件模式

**优先选择组合而非配置：**

```tsx
// 良好：可组合的
<Card>
  <CardHeader>
    <CardTitle>任务</CardTitle>
  </CardHeader>
  <CardBody>
    <TaskList tasks={tasks} />
  </CardBody>
</Card>

// 避免：过度配置的
<Card
  title="任务"
  headerVariant="large"
  bodyPadding="md"
  content={<TaskList tasks={tasks} />}
/>
```

**保持组件专注：**

```tsx
// 良好：只做一件事
export function TaskItem({ task, onToggle, onDelete }: TaskItemProps) {
  return (
    <li className="flex items-center gap-3 p-3">
      <Checkbox checked={task.done} onChange={() => onToggle(task.id)} />
      <span className={task.done ? 'line-through text-muted' : ''}>{task.title}</span>
      <Button variant="ghost" size="sm" onClick={() => onDelete(task.id)}>
        <TrashIcon />
      </Button>
    </li>
  );
}
```

**将数据获取与展示分离：**

```tsx
// 容器：处理数据
export function TaskListContainer() {
  const { tasks, isLoading, error } = useTasks();

  if (isLoading) return <TaskListSkeleton />;
  if (error) return <ErrorState message="加载任务失败" retry={refetch} />;
  if (tasks.length === 0) return <EmptyState message="暂无任务" />;

  return <TaskList tasks={tasks} />;
}

// 展示：处理渲染
export function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <ul role="list" className="divide-y">
      {tasks.map(task => <TaskItem key={task.id} task={task} />)}
    </ul>
  );
}
```

## 状态管理

**选择最简单有效的方法：**

```
本地状态 (useState)           → 组件特定的 UI 状态
提升状态                     → 在 2-3 个兄弟组件之间共享
Context                          → 主题、认证、区域设置（读取频繁，写入稀少）
URL 状态 (searchParams)         → 过滤器、分页、可共享的 UI 状态
服务器状态 (React 查询, SWR)  → 具有缓存的远程数据
全局存储 (Zustand, Redux)    → 在整个应用程序中共享的复杂客户端状态
```

**避免属性传递深度超过 3 层。** 如果您正在通过不使用它们的组件传递属性，请引入上下文或重构组件树。

## 设计系统遵循

### 避免 AI 美学

AI 生成的 UI 具有可识别的模式。避免所有这些模式：

| AI 默认值 | 为什么这是一个问题 | 生产质量 |
|---|---|---|
| 所有东西都是紫色/靛蓝色 | 模型默认使用视觉上"安全"的调色板，使每个应用看起来都相同 | 使用项目的实际调色板 |
| 过度使用渐变 | 渐变增加视觉噪音，与大多数设计系统冲突 | 平坦或与设计系统匹配的微妙渐变 |
| 所有东西都圆角 (rounded-2xl) | 最大圆角表示"友好"，但忽略了实际设计中圆角半径的层次结构 | 来自设计系统的一致圆角半径 |
| 通用的英雄部分 | 模板驱动的布局，与实际内容或用户需求无关 | 内容优先的布局 |
| Lorem ipsum 风格的文本 | 占位文本隐藏了真实内容揭示的布局问题（长度、换行、溢出） | 现实的占位内容 |
| 到处都使用过大的内边距 | 相等的慷慨内边距破坏视觉层次并浪费屏幕空间 | 一致的间距比例 |
| 标准的卡片网格 | 统一的网格是一种忽略信息优先级和扫描模式的布局捷径 | 有目的的布局 |
| 阴影重的设计 | 分层的阴影增加深度，与内容竞争并在低端设备上减慢渲染速度 | 除非设计系统指定，否则使用微妙或无阴影 |

### 间距和布局

使用一致的间距比例。不要发明值：

```css
/* 使用比例：0.25rem 增量（或项目使用的任何值） */
/* 良好 */  padding: 1rem;      /* 16px */
/* 良好 */  gap: 0.75rem;       /* 12px */
/* 不良 */   padding: 13px;      /* 不在任何比例上 */
/* 不良 */   margin-top: 2.3rem; /* 不在任何比例上 */
```

### 排版

尊重类型层次结构：

```
h1 → 页面标题（每页一个）
h2 → 部分标题
h3 → 子部分标题
body → 默认文本
small → 次要/辅助文本
```

不要跳过标题级别。不要将标题样式用于非标题内容。

### 颜色

- 使用语义颜色标记：`text-primary`、`bg-surface`、`border-default` —— 而不是原始十六进制值
- 确保足够的对比度（正常文本 4.5:1，大文本 3:1）
- 不要仅依赖颜色来传达信息（也使用图标、文本或图案）

## 可访问性 (WCAG 2.1 AA)

每个组件都必须符合这些标准：

### 键盘导航

```tsx
// 每个交互元素都必须是键盘可访问的
<button onClick={handleClick}>点击我</button>        // ✓ 默认可聚焦
<div onClick={handleClick}>点击我</div>               // ✗ 不可聚焦
<div role="button" tabIndex={0} onClick={handleClick}    // ✓ 但优先使用 <button>
     onKeyDown={e => {
       if (e.key === 'Enter') handleClick();
       if (e.key === ' ') e.preventDefault();
     }}
     onKeyUp={e => {
       if (e.key === ' ') handleClick();
     }}>
  点击我
</div>
```

### ARIA 标签

```tsx
// 标记缺少可见文本的交互元素
<button aria-label="关闭对话框"><XIcon /></button>

// 标记表单输入
<label htmlFor="email">邮箱</label>
<input id="email" type="email" />

// 或者在没有可见标签时使用 aria-label
<input aria-label="搜索任务" type="search" />
```

### 焦点管理

```tsx
// 当内容变化时移动焦点
function Dialog({ isOpen, onClose }: DialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
  }, [isOpen]);

  // 打开时将焦点限制在对话框内
  return (
    <dialog open={isOpen}>
      <button ref={closeRef} onClick={onClose}>关闭</button>
      {/* 对话框内容 */}
    </dialog>
  );
}
```

### 有意义的空状态和错误状态

```tsx
// 不要显示空白屏幕
function TaskList({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <div role="status" className="text-center py-12">
        <TasksEmptyIcon className="mx-auto h-12 w-12 text-muted" />
        <h3 className="mt-2 text-sm font-medium">暂无任务</h3>
        <p className="mt-1 text-sm text-muted">通过创建新任务开始。</p>
        <Button className="mt-4" onClick={onCreateTask}>创建任务</Button>
      </div>
    );
  }

  return <ul role="list">...</ul>;
}
```

## 响应式设计

先为移动端设计，然后扩展：

```tsx
// Tailwind：移动优先的响应式
<div className="
  grid grid-cols-1      /* 移动端：单列 */
  sm:grid-cols-2        /* 小屏幕：2 列 */
  lg:grid-cols-3        /* 大屏幕：3 列 */
  gap-4
">
```

在这些断点进行测试：320px、768px、1024px、1440px。

## 加载和过渡

```tsx
// 骨架屏加载（不是内容的旋转器）
function TaskListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="正在加载任务">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-12 bg-muted animate-pulse rounded" />
      ))}
    </div>
  );
}

// 用于感知速度的乐观更新
function useToggleTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: toggleTask,
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const previous = queryClient.getQueryData(['tasks']);

      queryClient.setQueryData(['tasks'], (old: Task[]) =>
        old.map(t => t.id === taskId ? { ...t, done: !t.done } : t)
      );

      return { previous };
    },
    onError: (_err, _taskId, context) => {
      queryClient.setQueryData(['tasks'], context?.previous);
    },
  });
}
```

## 另请参阅

有关详细的可访问性要求和测试工具，请参阅 `references/accessibility-checklist.md`。

## 常见辩解

| 辩解 | 现实 |
|---|---|
| "可访问性是一个可有可无的东西" | 这是许多司法管辖区的法律要求和工程质量标准。 |
| "我们稍后会使其具有响应性" | 改造响应式设计比从一开始就构建要困难 3 倍。 |
| "设计尚未最终确定，所以我会跳过样式" | 使用设计系统默认值。未样式化的 UI 会给评审者留下糟糕的第一印象。 |
| "这只是一个原型" | 原型会成为生产代码。从一开始就构建正确的基础。 |
| "AI 美学现在还可以" | 这表示低质量。从一开始就使用项目的实际设计系统。 |

## 危险信号

- 超过 200 行的组件（拆分它们）
- 内联样式或任意像素值
- 缺少错误状态、加载状态或空状态
- 没有键盘导航测试
- 颜色作为状态的唯一指示器（红色/绿色没有文本或图标）
- 通用的"AI 外观"（紫色渐变、过大的卡片、标准布局）

## 验证

构建 UI 后：

- [ ] 组件渲染没有控制台错误
- [ ] 所有交互元素都可键盘访问（通过 Tab 键浏览页面）
- [ ] 屏幕阅读器可以传达页面的内容和结构
- [ ] 响应式：在 320px、768px、1024px、1440px 下正常工作
- [ ] 加载、错误和空状态都已处理
- [ ] 遵循项目的设计系统（间距、颜色、排版）
- [ ] 开发工具或 axe-core 中没有可访问性警告
