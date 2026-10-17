---
name: setup-ts-deep-modules
description: 将 dependency-cruiser 接入 TypeScript 仓库，使每个包都成为深模块——实现隐藏在子文件夹中，只能通过其入口文件访问。由用户主动调用。
disable-model-invocation: true
---

# 设置 TS 深模块

让本仓库中的每个包都成为一个**深模块**：小接口背后隐藏大量行为。包的公共表面是其**入口点**——即位于包根目录的文件——而其子文件夹中的所有内容都是隐藏的。本技能安装 [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) 并配置规则，使入口点成为唯一的访问途径，然后验证这些规则确实生效。

关于术语（深模块、接口、接缝、深度），请运行 `/codebase-design` 技能——全文使用其中的语言。

## 本技能强制执行的结构

```
src/packages/
  <name>/
    index.ts        ← 入口点（公共）。从外部导入此文件。
    client.ts       ← 另一个入口点。包可以暴露多个入口点。
    lib/            ← 实现：对外隐藏，内部可自由互相导入。
    tests/          ← 就近存放的测试 + fixtures（属于子文件夹，因此是私有的）。
```

公共表面是包的**根文件**——而不是某个指定的 `index.ts`。按照惯例，实现放在 `lib/` 中，测试放在 `tests/` 中，使每个包具有相同的双文件夹结构。不过规则本身是通用的：*任何*子文件夹中的*任何*内容都是私有的，因此你永远不需要扩展配置来添加文件夹。

四条规则，全部为 `error` 级别：

1. **入口点边界** —— 包外部的代码（应用代码或其他包）只能导入该包的入口点（其根文件），绝不能导入其子文件夹中的任何内容。
2. **包内自由** —— 包自身的文件可以自由互相导入。
3. **测试通过入口点** —— `<pkg>/tests/` 下的文件可以导入任何包的入口点以及自己的 `tests/` fixtures，但绝不能导入任何包的子文件夹内部内容（即使是自己的也不行）。跨包的集成测试没问题；深层导入不行。
4. **禁止循环** —— 不允许出现依赖循环。

**是入口点，而不是 barrel。** 因为公共表面是*每一个*根文件，一个包可以暴露多个小入口点（`index.ts`、`client.ts`、`server.ts`），而不必把所有东西都塞进一个巨大的 `index.ts`。重新导出整个子树的 barrel 文件是不被鼓励的——保持入口点小而精，把实现隐藏在子文件夹中。

分层（哪些包可以依赖哪些包）是*另一个*关注点，留作配置中带注释的存根，由本仓库自行填写。

## 步骤

### 1. 检测环境

- **包管理器** —— `pnpm-lock.yaml` → pnpm，`yarn.lock` → yarn，`bun.lockb` → bun，否则为 npm。下面的所有命令都使用它（`pnpm`/`yarn`/`npm run`/`bunx`）。
- **包根目录** —— 如果存在 `src/` 则使用 `src/packages`，否则使用 `packages`。如果仓库已有其他明显的惯例，请与用户确认此选择。
- **现有配置** —— 检查是否存在 `.dependency-cruiser.*` 文件。如果存在，**不要**覆盖它：将四条规则和选项合并进去，并告知用户你添加了什么。

**完成标志：** 包管理器、包根目录和现有配置状态都已确定。

### 2. 安装 dependency-cruiser

使用检测到的包管理器将 `dependency-cruiser` 作为 devDependency 安装。

**完成标志：** `dependency-cruiser` 出现在 `devDependencies` 中。

### 3. 写入配置

将 [`dependency-cruiser.config.cjs`](./dependency-cruiser.config.cjs) 复制到仓库根目录并命名为 `.dependency-cruiser.cjs`。将 `PACKAGES_ROOT` 设置为步骤 1 中检测到的根目录。这些规则基于路径深度且与文件扩展名无关，因此无需其他调整。

**完成标志：** `.dependency-cruiser.cjs` 已存在且 `PACKAGES_ROOT` 正确，四条禁止规则均已就位。

### 4. 接入检查流程

- 添加一个 `lint:boundaries` 脚本：`depcruise <packages-root>`（或 `depcruise src`）。
- 将其并入仓库的总检查命令——即已经运行 typecheck 的那个命令（例如 `check` / `ci` / `validate` 脚本）。**不要**改动 `tsconfig` 或添加路径别名。
- 如果没有总检查脚本，则添加 `lint:boundaries` 并告知用户将其纳入 CI。

**完成标志：** `lint:boundaries` 已存在，并且与 typecheck 在同一条命令中一起运行。

### 5. 搭建示例包

创建一个已提交的 `<packages-root>/example/` 作为可复制的模板：

- `index.ts` —— 一个入口点。导出一个函数，委托给某个内部文件（这样这个包看起来就是*深*的，而不是简单的透传）。
- `lib/impl.ts` —— **子文件夹**中的内部文件，由 `index.ts` 导入，外部无法访问。
- `tests/example.test.ts` —— **只**导入 `../index`（一个入口点），并针对公共函数进行断言。

告诉用户这是一个可以复制或删除的起步模板。

**完成标志：** 示例包已存在，通过根入口点暴露其行为，并将 `impl` 隐藏在子文件夹中。

### 6. 验证规则确实生效

这是整个技能的完成标准——一个在违规时不报错的配置毫无价值。

1. 运行 `lint:boundaries`。它在干净的示例上必须**通过**。
2. 临时向 `tests/example.test.ts` 添加一个深层导入（例如 `import { thing } from "../lib/impl"`）。再次运行 `lint:boundaries`——它必须**失败**，报出 `tests-through-entrypoints`。
3. 撤销深层导入。再运行一次——必须**通过**。

**完成标志：** 你已经观察到通过 → 深层导入导致失败 → 再次通过。如果步骤 2 没有失败，说明规则未正确接入——完成前必须修复。

### 7. 文档化这一约定

在**包文件夹中**编写一个 `README.md`（`<packages-root>/README.md`）——就在它所约束的包旁边——内容包括：`src/packages/<name>/` 的布局（入口点在根目录，`lib/` 存放实现，`tests/` 存放测试）、“只能通过包的入口点（其根文件）导入”，以及如何运行 `lint:boundaries`。**明确不鼓励使用 barrel 文件**——暴露多个小入口点，而不是通过一个 index 重新导出整个子树。篇幅保持为可复制片段加上四条规则，每条规则一段。

然后在仓库的 agent 指令文件中添加一个**上下文指针**——如果有 `CLAUDE.md` 则用它，否则用 `AGENTS.md`（如果两者都不存在则创建 `AGENTS.md`）。一行即可，例如 `Packages are deep modules — see [src/packages/README.md](./src/packages/README.md) before adding or importing one.` 这正是让 agent 能够发现边界规则而不是触犯它的关键。

**完成标志：** `<packages-root>/README.md` 已存在且不鼓励 barrel 文件，并且仓库的 `CLAUDE.md`/`AGENTS.md` 链接到了它。

## 备注

- 配置中的 `$1` 反向引用（dependency-cruiser 的分组匹配）是让包能够访问自身内部内容而外部无法访问的关键——不要把它们拆散成逐包的独立规则。
- 公有与私有由**深度**决定：包的根文件是入口点；子文件夹中的任何内容都是私有的。惯例的子文件夹是 `lib/`（实现）和 `tests/`，但规则并不硬编码它们——任何子文件夹都是私有的，因此新增文件夹永远不需要修改配置。添加入口点只是添加一个根文件——不需要 barrel。
- 包是**扁平的**：根目录下只有一层直接子目录。包的内部可以嵌套任意深度；但一个包不能包含另一个包。
- 使用 `.cjs`（而不是 `.js`），这样即使在 `"type": "module"` 的仓库中，配置的 `module.exports` 也能正常工作。