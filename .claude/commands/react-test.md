---
description: 强制 React 的 TDD 工作流。先写 React Testing Library 测试（行为优先、无障碍优先），再实现组件。检测 Vitest 或 Jest 并验证覆盖率目标。
---

# React TDD 命令

此命令对 React 强制测试驱动开发，使用 React Testing Library 配合 Vitest 或 Jest（运行时检测）。

## 此命令做什么

1. **定义组件签名**：搭建组件、prop 类型和导出
2. **先写行为测试**：RTL 查询（role 优先）、`userEvent`、MSW 处理网络 —— RED
3. **运行测试**：验证它们因正确的原因而失败
4. **实现最小代码**：刚好足以通过 —— GREEN
5. **重构**：在保持测试通过的同时改进
6. **检查覆盖率**：达到 [rules/react/testing.md](../rules/react/testing.md) 中的目标

## 何时使用

在以下情况使用 `/react-test`：

- 实现新的 React 组件或自定义 hook
- 为未测试的组件添加测试覆盖
- 修复 bug（先写能复现它的失败测试）
- 构建表单、状态机或无障碍关键型 UI
- 熟悉 RTL + Vitest/Jest 工作流

## TDD 循环

```
RED      -> Write failing test for the next behavior
GREEN    -> Implement minimal component code to pass
REFACTOR -> Improve component, tests stay green
REPEAT   -> Next behavior
```

## 运行器检测

```bash
test -f vitest.config.ts -o -f vitest.config.js -o -f vite.config.ts   # Vitest
grep -l '"jest"' package.json                                          # Jest
```

新的基于 Vite 的项目优先使用 Vitest；对既有配置尊重 Jest。

## 会话示例

````text
User: /react-test I need a SearchInput component with debounced search

Agent:
# TDD Session: SearchInput

## Step 1: Define Signature

```tsx
// src/components/SearchInput.tsx
type Props = {
  onSearch: (query: string) => void;
  placeholder?: string;
  debounceMs?: number;
};

export function SearchInput({ onSearch, placeholder, debounceMs }: Props) {
  throw new Error("not implemented");
}
```

## Step 2: Write Behavior Tests (RED)

```tsx
// src/components/SearchInput.test.tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchInput } from "./SearchInput";

describe("SearchInput", () => {
  test("renders with placeholder", () => {
    render(<SearchInput onSearch={() => {}} placeholder="Search users" />);
    expect(screen.getByPlaceholderText("Search users")).toBeInTheDocument();
  });

  test("calls onSearch after typing", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSearch = vi.fn();
    render(<SearchInput onSearch={onSearch} debounceMs={300} />);

    await user.type(screen.getByRole("textbox"), "alice");

    expect(onSearch).not.toHaveBeenCalled();        // before debounce
    vi.advanceTimersByTime(300);
    expect(onSearch).toHaveBeenCalledWith("alice"); // after debounce

    vi.useRealTimers();
  });

  test("does not call onSearch when typing pauses then continues", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSearch = vi.fn();
    render(<SearchInput onSearch={onSearch} debounceMs={300} />);

    await user.type(screen.getByRole("textbox"), "ali");
    vi.advanceTimersByTime(200);                    // mid-debounce
    await user.type(screen.getByRole("textbox"), "ce");
    vi.advanceTimersByTime(300);

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("alice");

    vi.useRealTimers();
  });

  test("is keyboard reachable and accessible", () => {
    render(<SearchInput onSearch={() => {}} />);
    const input = screen.getByRole("textbox");
    input.focus();
    expect(input).toHaveFocus();
  });
});
```

## Step 3: Run Tests — Verify FAIL

```bash
$ vitest run src/components/SearchInput.test.tsx

× src/components/SearchInput.test.tsx (4 tests) ✘ Error: not implemented
```

✓ 测试如预期失败。

## Step 4: Implement Minimal Code (GREEN)

```tsx
import { useEffect, useState } from "react";

export function SearchInput({ onSearch, placeholder, debounceMs = 300 }: Props) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const id = setTimeout(() => onSearch(query), debounceMs);
    return () => clearTimeout(id);
  }, [query, onSearch, debounceMs]);

  return (
    <input
      type="text"
      value={query}
      placeholder={placeholder}
      onChange={(e) => setQuery(e.target.value)}
    />
  );
}
```

## Step 5: Run Tests — Verify PASS（验证通过）

```bash
$ vitest run src/components/SearchInput.test.tsx

✓ src/components/SearchInput.test.tsx (4 tests) 47ms
```

## Step 6: Coverage

```bash
$ vitest run --coverage src/components/SearchInput.test.tsx

% Stmts: 100  % Branch: 100  % Funcs: 100  % Lines: 100
```

## TDD Complete!
````

## 测试模式

### 测行为，而非实现

使用 `getByRole`、`getByLabelText`、`getByText`。避免 `container.querySelector` 以及对组件 state 的断言。

### 每个测试单独 `userEvent.setup()`

```tsx
const user = userEvent.setup();
await user.click(screen.getByRole("button", { name: /save/i }));
```

### 用 MSW 处理网络

```tsx
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

server.use(http.post("/api/users", () => HttpResponse.json({ id: "1" }, { status: 201 })));
```

### 自定义 hooks

```tsx
const { result } = renderHook(() => useCounter(0));
act(() => result.current.increment());
expect(result.current.count).toBe(1);
```

### 无障碍

```tsx
import { axe } from "vitest-axe";
expect(await axe(container)).toHaveNoViolations();
```

## 覆盖率目标

| Layer | Target |
|---|---|
| 纯工具函数 | >=90% |
| 自定义 hooks | >=85% |
| 展示型组件 | >=80% |
| 容器型组件 | >=70% |
| 页面 | 由 E2E 单独覆盖 |

在 `vitest.config.ts` / `jest.config.js` 中配置，以在 CI 中强制阈值。

## 要避免的反模式

- `container.querySelector(...)` —— 绕过了无障碍查询
- 对渲染次数做断言
- mock `react` 本身（`jest.mock("react", ...)`）
- 默认 mock 子组件（仅当子组件有重度副作用时才 mock）
- 忽略 `act()` 警告 —— 它们预示着真实的 bug
- 对渲染组件做快照测试（脆弱、草率盖章）—— 改用 Playwright/Cypress 的视觉 diff

## 测试命令

```bash
# Vitest
vitest                              # watch
vitest run                          # one-shot
vitest run --coverage               # with coverage
vitest run path/to/file.test.tsx    # single file

# Jest
jest --watch
jest --coverage
jest path/to/file.test.tsx

# CI mode
CI=true vitest run --coverage
```

## 相关命令

- `/react-build` — 运行测试前修复构建错误
- `/react-review` — 实现后审查
- `verification-loop` 技能 — 完整验证循环

## 相关

- Skills：`skills/react-testing/`, `skills/tdd-workflow/`, `skills/accessibility/`, `skills/e2e-testing/`
- Rules：`rules/react/testing.md`
- Agents：`react-reviewer`（审查测试质量）、`tdd-guide`（强制 TDD 流程）
