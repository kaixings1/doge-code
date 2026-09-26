---
name: code-simplification
description: 为清晰而简化代码。当在不改变行为的前提下重构代码以提升清晰度时使用。当代码能运行却比应有的更难阅读、维护或扩展时使用。当审查积累了不必要复杂度的代码时使用。
---

# 代码简化

> 灵感来自 [Claude Code Simplifier 插件](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-simplifier/agents/code-simplifier.md)。此处改编为不绑定模型、由流程驱动的技能，适用于任何 AI 编码代理。

## 总览

在保持行为完全一致的前提下，通过降低复杂度来简化代码。目标不是行数更少，而是代码更易阅读、理解、修改与调试。每一次简化都必须通过一个简单检验：新团队成员会比理解原版更快地理解它吗？

## 何时使用

- 当功能已跑通、测试已通过，但实现显得比实际需要更重时
- 在代码审查中被标记出可读性或复杂度问题时
- 当遇到深层嵌套逻辑、过长函数或不清晰的命名时
- 当重构在时间压力下写出的代码时
- 当归并散落在多个文件中的相关逻辑时
- 在合入引入了重复或不一致的变更之后

**何时不要使用：**

- 代码已经干净易读时，不要为简化而简化
- 你还没理解代码做什么时，先理解再简化
- 代码对性能敏感，且更简单的版本会明显更慢时
- 你即将完全重写该模块时，简化即将被丢弃的代码是在浪费精力

## 五条原则

### 1. 精确保持行为

不要改变代码**做什么**，只改变它**如何表达**。所有输入、输出、副作用、错误行为与边界情况都必须完全一致。如果你不确定某次简化能保持行为，就不要做。

```
每次改动前自问：
→ 它对每个输入都产出相同输出吗？
→ 它保持相同的错误行为吗？
→ 它保持相同的副作用与顺序吗？
→ 所有既有测试都无需修改就能通过吗？
```

### 2. 遵循项目约定

简化意味着让代码更符合代码库，而不是强加外部偏好。简化之前：

```
1. 阅读 CLAUDE.md 与项目约定
2. 研究相邻代码如何处理相似模式
3. 在以下方面匹配项目风格：
   - 导入顺序与模块系统
   - 函数声明风格
   - 命名约定
   - 错误处理模式
   - 类型注解深度
```

破坏项目一致性的简化不是简化，而是搅动（churn）。

### 3. 清晰优先于机巧

当紧凑版本需要停顿思考才能解析时，显式代码优于紧凑代码。

```typescript
// 不清晰：密集的三元表达式链
const label = isNew ? 'New' : isUpdated ? 'Updated' : isArchived ? 'Archived' : 'Active';

// 清晰：可读的映射
function getStatusLabel(item: Item): string {
  if (item.isNew) return 'New';
  if (item.isUpdated) return 'Updated';
  if (item.isArchived) return 'Archived';
  return 'Active';
}
```

```typescript
// 不清晰：带内联逻辑的链式 reduce
const result = items.reduce((acc, item) => ({
  ...acc,
  [item.id]: { ...acc[item.id], count: (acc[item.id]?.count ?? 0) + 1 }
}), {});

// 清晰：具名的中间步骤
const countById = new Map<string, number>();
for (const item of items) {
  countById.set(item.id, (countById.get(item.id) ?? 0) + 1);
}
```

### 4. 保持平衡

简化有一种失败模式：过度简化。警惕这些陷阱：

- **过度内联** —— 移除了一个为概念命名的辅助函数，会让调用点更难读
- **合并不相关逻辑** —— 两个简单函数并成一个复杂函数，并不更简单
- **移除不必要的抽象** —— 有些抽象是为可扩展性或可测试性而存在，并非复杂度
- **为行数而优化** —— 目标不是行数更少，而是更易理解

### 5. 限定在改动的范围内

默认只简化近期修改过的代码。除非被明确要求扩大范围，否则避免顺手重构无关代码。不限范围的简化会在 diff 中制造噪音，并带来意外回归的风险。

## 简化流程

### 步骤 1：动手之前先理解（切斯特顿栅栏）

在改动或删除任何东西之前，先理解它为何存在。这就是切斯特顿栅栏：如果你看到路上有一道栅栏，却不明白它为何在那里，就先别拆它。先搞清原因，再判断这个原因是否仍然成立。

```
简化之前，回答：
- 这段代码的职责是什么？
- 谁调用它？它调用谁？
- 有哪些边界情况与错误路径？
- 是否有测试定义了预期行为？
- 它为何可能被写成这样？（性能？平台约束？历史原因？）
- 查看 git blame：这段代码的原始上下文是什么？
```

如果你答不上这些，说明还没准备好简化。先阅读更多上下文。

### 步骤 2：识别简化机会

扫描以下模式 —— 每一条都是具体信号，而非含糊的坏味道：

**结构复杂度：**

| 模式 | 信号 | 简化方式 |
|---------|--------|----------------|
| 深层嵌套（3 层以上） | 控制流难以跟踪 | 把条件提取为卫语句或辅助函数 |
| 过长函数（50 行以上） | 多个职责 | 拆分为命名清晰、职责聚焦的函数 |
| 嵌套三元表达式 | 解析时需要心智堆栈 | 替换为 if/else 链、switch 或查找对象 |
| 布尔参数标志 | doThing(true, false, true) | 替换为选项对象或独立函数 |
| 重复的条件判断 | 多处出现相同的 if 检查 | 提取为命名良好的谓词函数 |

**命名与可读性：**

| 模式 | 信号 | 简化方式 |
|---------|--------|----------------|
| 泛化命名 | data、result、temp、val、item | 重命名为能描述内容：userProfile、validationErrors |
| 缩写命名 | usr、cfg、btn、evt | 使用完整词，除非缩写已是通用惯例（id、url、api） |
| 误导性命名 | 名为 get 却同时修改状态的函数 | 重命名为反映真实行为 |
| 解释做什么的注释 | count++ 上方的 // 递增计数器 | 删掉注释 —— 代码本身已足够清楚 |
| 解释为什么的注释 | // 重试，因为该 API 在负载下不稳定 | 保留这些 —— 它们承载着代码无法表达的意图 |

**冗余：**

| 模式 | 信号 | 简化方式 |
|---------|--------|----------------|
| 重复逻辑 | 多处出现相同的 5 行以上代码 | 提取为共享函数 |
| 死代码 | 不可达分支、未使用变量、被注释掉的块 | 删除（确认它确实是死的之后） |
| 不必要的抽象 | 不产生价值的包装器 | 内联该包装器，直接调用底层函数 |
| 过度工程化的模式 | 工厂的工厂、只有一个策略的策略模式 | 替换为简单直接的做法 |
| 冗余类型断言 | 断言到一个已被推导出的类型 | 移除该断言 |

### 步骤 3：增量应用改动

一次只做一处简化。每处改动后运行测试。**重构类改动要与功能或修复类改动分开提交。** 一个同时重构又新增功能的 PR 其实是两个 PR —— 请拆开。

```
对每一次简化：
1. 做出改动
2. 运行测试套件
3. 若测试通过 → 提交（或继续下一处简化）
4. 若测试失败 → 回滚并重新考虑
```

避免把多处简化打包成一次未经验证的改动。一旦出问题，你需要知道是哪一处简化引起的。

**500 行法则：** 如果一次重构会触及 500 行以上，就去投入自动化（codemod、sed 脚本、AST 变换），而不是手工逐个改。那种规模的手工编辑容易出错，且审查起来令人疲惫。

### 步骤 4：验证结果

完成所有简化后，退一步评估整体：

```
对比简化前后：
- 简化后的版本真的更易理解吗？
- 你是否引入了与代码库不一致的新模式？
- diff 是否干净、可审查？
- 同事会批准这次改动吗？
```

如果简化后的版本更难理解或审查，就回滚。并非每一次简化尝试都会成功。

## 按语言的指导

### TypeScript / JavaScript

```typescript
// 简化：不必要的 async 包装
// 之前
async function getUser(id: string): Promise<User> {
  return await userService.findById(id);
}
// 之后
function getUser(id: string): Promise<User> {
  return userService.findById(id);
}

// 简化：冗长的条件赋值
// 之前
let displayName: string;
if (user.nickname) {
  displayName = user.nickname;
} else {
  displayName = user.fullName;
}
// 之后
const displayName = user.nickname || user.fullName;

// 简化：手工构建数组
// 之前
const activeUsers: User[] = [];
for (const user of users) {
  if (user.isActive) {
    activeUsers.push(user);
  }
}
// 之后
const activeUsers = users.filter((user) => user.isActive);

// 简化：多余的布尔返回
// 之前
function isValid(input: string): boolean {
  if (input.length > 0 && input.length < 100) {
    return true;
  }
  return false;
}
// 之后
function isValid(input: string): boolean {
  return input.length > 0 && input.length < 100;
}
```

### Python

```python
# 简化：冗长的字典构建
# 之前
result = {}
for item in items:
    result[item.id] = item.name
# 之后
result = {item.id: item.name for item in items}

# 简化：带提前返回的嵌套条件
# 之前
def process(data):
    if data is not None:
        if data.is_valid():
            if data.has_permission():
                return do_work(data)
            else:
                raise PermissionError("No permission")
        else:
            raise ValueError("Invalid data")
    else:
        raise TypeError("Data is None")
# 之后
def process(data):
    if data is None:
        raise TypeError("Data is None")
    if not data.is_valid():
        raise ValueError("Invalid data")
    if not data.has_permission():
        raise PermissionError("No permission")
    return do_work(data)
```

### React / JSX

```tsx
// 简化：冗长的条件渲染
// 之前
function UserBadge({ user }: Props) {
  if (user.isAdmin) {
    return <Badge variant="admin">Admin</Badge>;
  } else {
    return <Badge variant="default">User</Badge>;
  }
}
// 之后
function UserBadge({ user }: Props) {
  const variant = user.isAdmin ? 'admin' : 'default';
  const label = user.isAdmin ? 'Admin' : 'User';
  return <Badge variant={variant}>{label}</Badge>;
}

// 简化：经由中间组件的 prop 逐层透传
// 之前 —— 先考虑 context 或组合是否能更好解决。
// 这是一个需要判断的决策 —— 标记出来，不要自动重构。
```

## 常见自我合理化

| 自我合理化 | 现实 |
|---|---|
| 它能跑，没必要动 | 难读的可运行代码，坏起来也会难修。现在简化能省下未来每一次改动的时间。 |
| 行数少总是更简单 | 1 行的嵌套三元表达式并不比 5 行的 if/else 更简单。简单关乎理解速度，而非行数。 |
| 我顺手把这段无关代码也简化一下 | 不限范围的简化会制造嘈杂 diff，并给你本不打算改的代码带来回归风险。保持聚焦。 |
| 类型已经让它自文档化了 | 类型记录的是结构，而非意图。一个命名良好的函数解释为什么优于类型签名解释是什么。 |
| 这个抽象以后可能有用 | 不要保留投机的抽象。若现在没用到，它就是没有价值的复杂度。删掉，需要时再加。 |
| 原作者一定有他的理由 | 也许是。查 git blame，运用切斯特顿栅栏。但累积的复杂度常常并无理由，它只是压力下反复迭代的残渣。 |
| 我边加功能边重构 | 把重构与功能开发分开。混杂的改动更难审查、回滚，也更难在历史中理解。 |

## 危险信号

- 需要修改测试才能通过的简化（你很可能改了行为）
- 简化后的代码比原版更长、更难读懂
- 按个人偏好而非项目约定重命名
- 因为让代码更干净就移除错误处理
- 简化自己未完全理解的代码
- 把大量简化打包进一个巨大、难以审查的提交
- 未经要求就重构当前任务范围外的代码

## 验证

完成一轮简化之后：

- [ ] 所有既有测试无需修改即通过
- [ ] 构建成功且无新增警告
- [ ] Linter/formatter 通过（无风格回退）
- [ ] 每处简化都是可审查的、增量的改动
- [ ] diff 干净 —— 未混入无关改动
- [ ] 简化后的代码遵循项目约定（对照 CLAUDE.md 或等价文件检查）
- [ ] 未移除或削弱任何错误处理
- [ ] 未留下死代码（未使用导入、不可达分支）
- [ ] 同事或审查代理会将其判定为净改进而予以批准
