---
name: migrate-to-shoehorn
description: 将测试文件从 `as` 类型断言迁移到 @total-typescript/shoehorn。当用户提到 shoehorn、想在测试中替换 `as`，或需要部分测试数据时使用。
---

# 迁移到 Shoehorn

## 为什么用 shoehorn？

`shoehorn` 让你在测试中传递部分数据，同时让 TypeScript 保持满意。它用类型安全的替代方案取代 `as` 断言。

**仅用于测试代码。** 切勿在生产代码中使用 shoehorn。

测试中使用 `as` 的问题：

- 通常被训练不去使用它
- 必须手动指定目标类型
- 需要双重 `as`（`as unknown as Type`）来传递故意错误的数据

## 安装

```bash
npm i @total-typescript/shoehorn
```

## 迁移模式

### 只需要少数属性的大型对象

之前：

```ts
type Request = {
  body: { id: string };
  headers: Record<string, string>;
  cookies: Record<string, string>;
  // ...还有 20 个属性
};

it("gets user by id", () => {
  // 只关心 body.id，但必须伪造整个 Request
  getUser({
    body: { id: "123" },
    headers: {},
    cookies: {},
    // ...伪造所有 20 个属性
  });
});
```

之后：

```ts
import { fromPartial } from "@total-typescript/shoehorn";

it("gets user by id", () => {
  getUser(
    fromPartial({
      body: { id: "123" },
    }),
  );
});
```

### `as Type` → `fromPartial()`

之前：

```ts
getUser({ body: { id: "123" } } as Request);
```

之后：

```ts
import { fromPartial } from "@total-typescript/shoehorn";

getUser(fromPartial({ body: { id: "123" } }));
```

### `as unknown as Type` → `fromAny()`

之前：

```ts
getUser({ body: { id: 123 } } as unknown as Request); // 故意使用错误类型
```

之后：

```ts
import { fromAny } from "@total-typescript/shoehorn";

getUser(fromAny({ body: { id: 123 } }));
```

## 何时使用哪个

| 函数            | 使用场景                                           |
| --------------- | -------------------------------------------------- |
| `fromPartial()` | 传递仍然通过类型检查的部分数据                     |
| `fromAny()`     | 传递故意错误的数据（保留自动补全）                 |
| `fromExact()`   | 强制完整对象（之后可以换成 fromPartial）           |

## 工作流程

1. **收集需求** - 询问用户：
   - 哪些测试文件中存在导致问题的 `as` 断言？
   - 是否在处理只有部分属性重要的大型对象？
   - 是否需要为错误测试传递故意错误的数据？

2. **安装并迁移**：
   - [ ] 安装：`npm i @total-typescript/shoehorn`
   - [ ] 查找包含 `as` 断言的测试文件：`grep -r " as [A-Z]" --include="*.test.ts" --include="*.spec.ts"`
   - [ ] 将 `as Type` 替换为 `fromPartial()`
   - [ ] 将 `as unknown as Type` 替换为 `fromAny()`
   - [ ] 添加来自 `@total-typescript/shoehorn` 的导入
   - [ ] 运行类型检查进行验证