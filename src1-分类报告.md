# src1 文件分类报告

## 执行时间
2026年4月11日

## 分类规则
- **保留在 src1**: 汉化程度 >= src 的文件（1199 个）
- **移动到 src1-error**: 汉化程度 < src 或无中文的文件（827 个）

## 统计结果

| 类别 | 文件数 |
|------|--------|
| 保留在 src1 | 1,199 |
| 移到 src1-error（汉化较少） | 180 |
| 移到 src1-error（无中文） | 647 |
| **总共移出 src1** | **827** |

## 移到 src1-error 的汉化较少文件（180个）

这些文件的 src1 汉化程度低于 src，需要人工对比合并：

```
bridge/bridgeUI.ts                 (src: 234, src1: 212, 差: -22)
cli/print.ts                       (src: 720, src1: 111, 差: -609)
cli/structuredIO.ts                (src: 125, src1: 21, 差: -104)
cli/transports/ccrClient.ts        (src: 179, src1: 34, 差: -145)
cli/transports/HybridTransport.ts  (src: 59, src1: 39, 差: -20)
cli/transports/SSETransport.ts     (src: 22, src1: 9, 差: -13)
cli/update.ts                      (src: 1094, src1: 11, 差: -1083)
commands/branch/branch.ts          (src: 100, src1: 29, 差: -71)
commands/bridge/bridge.tsx         (src: 27, src1: 5, 差: -22)
commands/extra-usage/extra-usage-noninteractive.ts (src: 36, src1: 0, 差: -36)
commands/install-github-app/ApiKeyStep.tsx          (src: 40, src1: 4, 差: -36)
commands/install-github-app/CheckExistingSecretStep.tsx (src: 68, src1: 3, 差: -65)
commands/install-github-app/ChooseRepoStep.tsx      (src: 62, src1: 4, 差: -58)
commands/install-github-app/OAuthFlowStep.tsx       (src: 205, src1: 24, 差: -181)
commands/install-github-app/setupGitHubActions.ts   (src: 84, src1: 44, 差: -40)
commands/plugin/AddMarketplace.tsx                  (src: 81, src1: 8, 差: -73)
commands/plugin/BrowseMarketplace.tsx               (src: 240, src1: 66, 差: -174)
commands/plugin/DiscoverPlugins.tsx                 (src: 289, src1: 34, 差: -255)
commands/plugin/ManageMarketplaces.tsx              (src: 252, src1: 76, 差: -176)
commands/plugin/PluginErrors.tsx                    (src: 145, src1: 2, 差: -143)
commands/plugin/PluginSettings.tsx                  (src: 240, src1: 78, 差: -162)
commands/ultraplan.tsx                              (src: 379, src1: 24, 差: -355)
components/ContextVisualization.tsx                 (src: 142, src1: 20, 差: -122)
components/IdeOnboardingDialog.tsx                  (src: 67, src1: 7, 差: -60)
components/InvalidSettingsDialog.tsx                (src: 62, src1: 30, 差: -32)
components/LogoV2/WelcomeV2.tsx                     (src: 635, src1: 604, 差: -31)
components/TeleportStash.tsx                        (src: 127, src1: 97, 差: -30)
components/agents/AgentDetail.tsx                   (src: 60, src1: 0, 差: -60)
components/agents/AgentEditor.tsx                   (src: 79, src1: 33, 差: -46)
components/agents/AgentsMenu.tsx                    (src: 94, src1: 62, 差: -32)
components/design-system/KeyboardShortcutHint.tsx   (src: 37, src1: 2, 差: -35)
components/mcp/ElicitationDialog.tsx                (src: 75, src1: 30, 差: -45)
... 还有 150 个文件
```

## 保留在 src1 的高价值汉化文件（部分示例）

这些是 src1 汉化明显优于 src 的文件：

```
bootstrap/state.ts              (src: 101, src1: 5,316, 差: +5,215)
bridge/bridgeMain.ts            (src: 130, src1: 12,877, 差: +12,747)
cli/handlers/autoMode.ts        (src: 90, src1: 585, 差: +495)
commands/mcp/xaaIdpCommand.ts   (src: 14, src1: 939, 差: +925)
components/OffscreenFreeze.tsx  (src: 4, src1: 413, 差: +409)
components/PromptInput/useSwarmBanner.ts (src: 3, src1: 429, 差: +426)
commands/voice/voice.ts         (src: 3, src1: 281, 差: +278)
components/FallbackToolUseErrorMessage.tsx (src: 23, src1: 282, 差: +259)
commands/rename/rename.ts       (src: 1, src1: 196, 差: +195)
commands/extra-usage/extra-usage-core.ts (src: 1, src1: 155, 差: +154)
utils/messages.ts               (src: 245, src1: 1,050, 差: +805)
```

## 下一步建议

1. **对于移到 src1-error 的文件**：
   - 使用 `diff` 工具逐个对比 src 和 src1-error 中的同名文件
   - 将 src1 中使用 i18n 的代码合并到 src
   - 保留 src 中更完整的汉化内容

2. **对于保留在 src1 的文件**：
   - 这些文件可以直接作为汉化参考
   - 注意检查 i18n 相关代码是否正确工作

3. **i18n 本地化问题**：
   - src1 中大量使用了类似 `i18next.t('key', '默认文本')` 的模式
   - 这是一个未完成的本地化方案，需要确认是否继续使用
   - 建议统一为直接中文替换或完整的 i18n 方案
