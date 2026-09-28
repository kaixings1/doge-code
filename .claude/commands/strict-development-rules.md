# Gemini CLI 严格开发规则

这些规则严格适用于 Gemini CLI 项目内的所有代码修改与新增。

## 测试准则

- **Async/Await**：在 `packages/cli` 内的所有 `waitFor` 调用中，始终使用来自
  `packages/cli/src/test-utils/async.ts` 的 `waitFor`，而非 `vi.waitFor`。
  **绝不**使用固定等待（例如
  `await delay(100)`）。始终使用带断言的 `waitFor`，以确保测试稳定且快速。使用
  错误的 `waitFor` 会导致测试不稳定和 `act` 警告。

- **React 测试**：用 `act` 包裹测试中所有会改变组件状态的代码块。使用
  `packages/cli/src/test-utils/render.tsx` 中的 `render` 或 `renderWithProviders`，而不是直接使用
  `ink-testing-library` 的 `render`。这能防止虚假的 `act` 警告。如果测试用例直接指定了 providers，
  请考虑是否应修改现有的 `renderWithProviders`。

  
- **快照**：使用 `toMatchSnapshot` 验证渲染是否如预期，而不是去匹配输出的原始内容。
  修改快照时，验证变更是有意的且没有掩盖底层 bug。

  
- **参数化测试**：在能减少重复行时使用参数化测试。给参数显式类型以确保测试类型安全。

- **Mock 管理**：
  - 关键依赖（`fs`、`os`、`child_process`）**只**在文件顶部 mock。理想情况下，完全避免 mock 这些依赖。

  - 复用现有的 mock 和 fake，而不是创建新的。
  - 尽可能避免 mock 文件系统。如果使用真实文件系统太困难，考虑改写成集成测试。

  - 始终在 `afterEach` 中调用 `vi.restoreAllMocks()` 以防止测试污染。
  - 对涉及时间逻辑的测试使用 `vi.useFakeTimers()` 以避免不稳定。

- **测试中的类型**：测试中避免使用 `any`；优先使用正确的类型，或配合收窄的 `unknown`。

## React 准则（`packages/cli`）

- **`setState` 与副作用**：**绝不**在 `setState` 回调体内触发副作用。如有必要，使用 reducer 或
`useRef`。这类情况历史上引入过多个 bug；通常应使用 reducer 解决。

- **渲染**：不要引入无限渲染循环。避免在 React 组件中进行同步文件 I/O，那会挂起 UI。
不要为自定义字符串测量或字符串截断实现新逻辑。改用 Ink 布局，必要时利用 `ResizeObserver`。

- **键盘处理**：键盘处理**必须**经过 Gemini CLI 包的 `useKeyPress.ts`，而不是标准 ink 库。
该库支持在同一 React 帧内顺序上报多个键盘事件（对慢速终端至关重要）。正确处理这通常需要
reducer，以确保多次状态更新被优雅处理而不互相覆盖。参见 `text-buffer.ts` 的规范示例。

- **日志**：不要在代码中留下 `console.log`、`console.warn` 或 `console.error`。

- **状态**：确保状态初始化是显式的（例如，如果状态确实未知，使用 `undefined` 而非 `true` 作为默认值）。只要实际可行就优先使用 reducer。**绝不**禁用 `react-hooks/exhaustive-deps`；而是修正代码以正确声明依赖。评估组件中所有 React 状态，确保 `useState` 调用是必要的，而非本可在渲染时派生的情况。确保没有依赖上一次渲染值的陈旧闭包。修改 Settings 的 React 组件应有效使用 `useSettingsStore` 模式。配置应用 Settings（如 settings.json）的组件是未保存变更驱动 UX 的唯一合理场景；在这些情况下，Settings store 应仅在保存时写入。如果用户体验不使用未保存变更（因为没有不保存就退出或回滚未保存变更的选项），那么组件应直接读写 Settings store，而不在组件级 UI 状态中持有待定变更。
- **Effect**：`useEffect` 不应用于同步 React 状态，只应用于 React 之外发生的真实副作用。
贡献者应能为使用 effect 的必要性给出强有力的理由。考虑该 effect 是否更应放在事件处理器内，
或更适合在渲染时计算。谨慎管理 `useEffect` 依赖。

- **Context 与 Props**：避免过度逐层透传。利用现有 providers、扩展它们，或必要时提议新的。
只对在整个应用中一致的属性使用 providers。

- **代码结构**：能用 `switch` 语句的地方避免复杂的 `if` 语句。保持 `AppContainer` 精简；
把复杂逻辑重构进 React hooks。评估业务逻辑应加入 `hookSystem.ts` 还是集成到 `packages/core`，
而不是 `packages/cli`。

## 核心准则（`packages/core`）

- **服务**：把服务实现为具有清晰生命周期管理的类（例如 `initialize()` 方法）。服务应尽可能无状态，
或使用集中式 `Storage` 服务做持久化。

- **跨服务通信**：服务之间的异步通信、或向 UI 通知状态变更时，优先使用 `coreEvents` 总线（来自
`packages/core/src/utils/events.ts`）。避免服务之间紧耦合。

- **工具函数**：内部日志使用 `packages/core/src/utils/debugLogger.ts` 的 `debugLogger`，而非
`console`。确保所有 shell 操作使用 `packages/core/src/utils/shell-utils.ts` 的 `spawnAsync`
以获得一致的错误处理和 promise 管理。使用 `packages/core/src/utils/errors.ts` 的 `isNodeError`
优雅处理文件系统错误。

- **导出与工具**：把新工具加入 `packages/core/src/tools/` 并在
`packages/core/src/tools/tool-registry.ts` 中注册。从 `packages/core/src/index.ts` 导出所有新的
公共服务、工具函数和类型。

## 架构审计（包边界）

- **逻辑归属**：非 UI 逻辑（例如模型编排、工具实现、git/文件系统操作）**必须**位于 `packages/core`。
`packages/cli` 应**只**包含 UI/Ink 组件、命令行参数解析和用户交互逻辑。

- **环境隔离**：核心逻辑不得假定 TUI 环境。从 Core 与用户通信时使用 `ConfirmationBus` 或
`Output` 抽象。

- **解耦**：主动寻找使用 `coreEvents` 解耦服务的机会。如果某服务导入另一个服务只是为了通知其某项变更，
改用事件。

## Gemini CLI 通用设计原则

- **Settings**：对用户可配置的选项使用 settings，而不是新增命令行参数。把新 settings 加入
`packages/cli/src/config/settingsSchema.ts`。如果某 setting 有
`showInDialog: true`，它**必须**在
`docs/get-started/configuration.md` 中有文档。确保 `requiresRestart` 设置正确。

- **日志**：对重新抛出的错误使用 `debugLogger`，以避免重复日志。
- **键盘快捷键**：在 `packages/cli/src/ui/key/keyBindings.ts` 中定义所有新键盘快捷键，并在
`docs/cli/keyboard-shortcuts.md` 中记录它们。注意需要 `Meta` 键的键位绑定，因为 Mac 上只支持某些 meta
键快捷键。避免功能键和 VSCode 中常被占用的快捷键。

## TypeScript 最佳实践

- 在 `switch` 语句的 `default` 分支中使用 `checkExhaustive`，以确保所有情况都被处理。

- 除非绝对必要，避免使用非空断言操作符（`!`）。
- **严格类型**：CLI 和 Core 包中**严格禁止** `any` 和 `unknown`。只有当 `unknown`
立即通过类型守卫或 Zod 校验被收窄时才允许使用。

- **绝不**禁用 `@typescript-eslint/no-floating-promises`。
- 除非严格必要，避免让类型可为空，因为那会损害可读性。

## TUI 最佳实践

- **终端兼容性**：考虑变更在不同终端下可能行为不同（例如 VSCode 终端、SSH、Kitty、默认 Mac 终端、
iTerm2、Windows 终端）。如果修改键盘处理，请与 `KeypressContext.tsx` 和
`terminalCapabilityManager.ts` 等既有文件深度集成。

- **iTerm**：注意当用户从 iTerm 内部运行 VSCode 时，即使终端不是 iTerm，`ITERM_SESSION_ID` 也可能存在。

## 代码清理

- **重构**：在代码库中工作时，主动清理代码重复、技术债和样板代码（"AI Slop"）。

- **提示词**：注意变更可能影响发送给 Gemini CLI 的提示词并影响整体质量。

