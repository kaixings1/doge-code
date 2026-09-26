---
name: heartflow-engine
title: "HeartFlow — AGI Layer 1：判别器（心虫）· doge-code 集成"
version: "6.7.24"
description: 对 AI 输出/决策做判别（truthfulness、hallucination、overconfidence/能力过度宣称、contradiction、逻辑谬误、情感伦理、记忆认知质量）的规则引擎门禁。当需要判断一段文本或一个决策是否正确、安全、可信时使用。已通过 MCP 接入 doge-code，gate 语义 block/rewrite/verify/pass。
when-to-use: 当需要校验 AI 回复是否可信、是否过度自信、是否自相矛盾、是否含逻辑谬误、是否需在输出给用户前加一道判别闸门时。
---

# HeartFlow (心虫) — doge-code 集成引导

**这是什么**：HeartFlow 是 AGI Layer 1 判别器，纯规则引擎（零 LLM 依赖），
对语句/决策输出确定性判别结论。它不替你写，它**说你这句话对不对**。

**在 doge-code 中如何接入**：已作为独立子系统置于 `vendor/heartflow/`，
通过 **MCP（SSE）** 暴露 **165 个判别工具**。无需修改 doge-core。

## 一、快速使用（MCP 工具）

HeartFlow 已在 `D:/doge-code/.mcp.json` 注册为 `heartflow`（`sse` 类型，端口 8099）。

**何时触发**：当需要给 AI 输出加判别、或检查一段文本的
正确性/安全性/可信度时，调用 `heartflow_*` 系列 MCP 工具，例如：
`heartflow_cognitive_check`、`heartflow_*judge*`、`heartflow_*verif*`、`heartflow_*discriminat*`。
先用 `tools list` 查看可用判别工具，再按需调用。

**启动 MCP 服务**（若未运行）：
```
! D:/doge-code/vendor/heartflow/scripts/start-mcp.bat
```
端口 8099，鉴权 token 由 `vendor/heartflow/.env` 的 `MCP_HEARTFLOW_KEY` 管理
（已被 .gitignore 排除，不入库），doge 通过 `scripts/mcp-headers-helper.cmd` 自动读取。

## 二、核心判别语义（无论走 MCP 还是直接调用 gate）

直接调用引擎（Node）：
```js
const { gate } = require('D:/doge-code/vendor/heartflow/src/gate.js');
const r = gate('要判别的文本');
// r.gate.action ∈ 'block' | 'rewrite' | 'verify' | 'pass'
```

| action | 含义 | 建议 |
|--------|------|------|
| `block` | 拦截输出 | 不输出，改说更稳妥的方案 |
| `rewrite` | 需改写 | 改写后再输出 |
| `verify` | 需验证 | 补充证据链再下结论 |
| `pass` | 通过 | 可放行 |

判别维度：truthfulness / hallucination / overconfidence（能力过度宣称）/ contradiction /
逻辑谬误 / 情感伦理 / 记忆认知质量等 **46 维度 × 9 层流水线**。

## 三、适用场景触发清单

- 用户/AI 说"我 100% 肯定、绝无风险、板上钉钉、铁定"等**绝对化表述** → 应判别 → 常触发 `verify`/`rewrite`（overconfidence）
- AI 就事实问题给出**高置信但无证据**结论 → `verify`
- 需在**输出一道质量/安全闸门 → 用 gate/pipeline
- 判断情感、伦理、心理维度（同理心、创伤、美德、意义）

## 四、界限与原则

- 这是规则引擎模拟判别信号，**不是意识**。
- 默认代码执行、文件写入关闭；无遥测、无外传。
- 不要在无关场景滥用；只在需要"判别/校验"时调用。

完整文档见 `vendor/heartflow/SKILL.md`。