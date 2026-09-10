# 实施计划：仓库瘦身 + 插件化动态加载 + 提示词/token 优化

状态: pending approval
创建: 2026-09-06
执行人: 按用户"批准"指示顺序执行 Phase1 → Phase2 → Phase3

## 需求摘要
分三阶段：仓库瘦身 → 插件化动态加载 → 减少提示词/token。

## 代码库事实（已验证）
- `src/commands.ts`（1143行，294个import）：顶部80+静态import；注册结构 `INTERNAL_ONLY_COMMANDS`(L420)、`builtInCommandNames`(L731)、`findCommand`(L1078)
- 动态加载基础设施已存在：`src/commands/loader.ts` 的 `safeRequire`/`loadConditionalCommand`；L198-275 已条件加载约15个命令
- token/提示词设施：`engine/tokenBudgetManager.ts`、`query/tokenBudget.ts`、`utils/tokenBudget.ts`、`constants/systemPromptSections.ts`(compute+cache)、`performance/LazyLoader.ts`、`engine/index.ts` 新加 `truncateToolResult`
- `.git` pack 文件 485MB；`@anthropic-ai` 孤儿包 265MB（package.json 未声明、src/ 未引用）
- 当前 git 跟踪源码仅 42MB

## Phase 1 — 仓库瘦身（低风险，先行）
### 验收
- [ ] `git count-objects -vH` .git 从 ~468MB 降至 <50MB
- [ ] `@anthropic-ai` 已删（node_modules 1.1GB→<850MB）
- [ ] `bun run lint` + 测试通过
- [ ] 工作区 git 跟踪的 42MB 源码不变
### 步骤
1. 删 node_modules 孤儿包 `@anthropic-ai`
2. git 历史精简：`git filter-repo --strip-blobs-bigger-than 1M` → `git gc --aggressive --prune=now`（破坏性，执行前 git bundle 备份；远程推送需单独批准）
3. 验证

## Phase 2 — 插件化动态加载（中风险）
### 验收
- [ ] commands.ts 顶部静态 import 从 ~80+ 降至核心
- [ ] 新命令放 `src/commands/<name>/index.ts` 自动注册（OCP）
- [ ] lint + 测试通过，/help 命令集与改造前一致
- [ ] 启动加载量减少
### 步骤
1. 新建 `src/commands/registry.ts` 扫描器（gloves 扫描 `src/commands/*/index.ts`，复用 safeRequire/loadConditionalCommand）
2. 改 commands.ts：80+静态import → 惰性 loader + memoize
3. 兼容 Electron bundle（feature() 判断回退）
4. 验证命令集对等

## Phase 3 — 减少提示词/token
### 验收
- [ ] 非激活 skill/feature 常量不再注入
- [ ] truncateToolResult 生效 + 修正 makeTruncationMarker 硬编码计数bug
- [ ] 复用 tokenBudgetManager 超预算时降级提示词
- [ ] prompt_tokens 持久比对下降
### 步骤
1. 审查 systemPromptSections.ts 条件化惰性 section
2. tokenBudgetManager 预算配置与降级策略
3. 修正并单测 truncateToolResult
4. toolLimits/apiLimits 联动核对

## 已验证的附加发现
- `src/engine/index.ts` truncateToolResult 的 makeTruncationMarker 硬编码 `totalLen-20000`，但截断由 `DEFAULT_MAX_RESULT_SIZE_CHARS`(50000) 驱动 → 改为 `totalLen - maxChars`（归 Phase 3）

## 验证方案
| 阶段 | 命令 |
|------|------|
| P1 | `git count-objects -vH`、`du -sh node_modules`、`bun run lint` |
| P2 | `bun test`、`/help` 对比、`bun run build`+`dev` |
| P3 | 单元测试 + token 计数对比 |