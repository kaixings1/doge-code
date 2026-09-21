# 心虫 HeartFlow 全面审计报告

**审计对象**：`/root/hermes1/skills/ai/mark-heartflow-skill` → 实体 `/root/.hermes/skills/ai/mark-heartflow-skill`
**引擎版本**：6.7.23（`VERSION` / `package.json` / 引擎运行时三处一致）
**Git HEAD**：`043dc4c3`（branch `main`，工作区 clean，最后提交 2026-09-16 22:07）
**审计日期**：2026-09-17
**审计方式**：引擎真实加载 + 关键路径实跑 + 静态扫描 + MCP 端到端调用（全部为实测输出，未做推断）
**审计性质**：只读审计。本报告不改动任何代码。

---

## 一、总体结论

| 维度 | 评级 | 一句话 |
|---|---|---|
| 加载与稳定性 | 🟢 良好 | 132 模块全部注册，`_initErrors` 为 0，`bin/verify.js` 14/14，测试套件 410/0 |
| 判别输出质量 | 🔴 不合格 | 真假断言、情绪输入、决策输入均返回同一套固定文案，核心能力未生效 |
| 能力接线率 | 🟠 偏低 | 154 个懒加载模块中只有约 10 个进入 `think()` 主路径 |
| 记忆系统 | 🔴 断裂 | 两套记忆互不相通；MCP 视角报告 0 条记忆 |
| MCP 暴露面 | 🟠 失控 | 实际 165 个工具，文档声称 129 个 |
| 测试有效性 | 🟠 半失效 | 410 个声称全绿；44 个嵌套测试文件从未被执行，且路径错误无法独立运行 |
| 版本一致性 | 🟠 漂移 | 4 个版本记录源，3 个落后于引擎 |
| 仓库卫生 | 🟠 偏胖 | 工作区 86MB / `.git` 133MB；47MB 语料入库 |
| 安全 | 🟡 可接受 | 无硬编码密钥入库；但 git remote 内嵌明文 token |

**核心判断**：心虫的**骨架是活的、完整的、可加载的**；但它的**心肌没有接上**——真正决定"能不能判别"的那条链路（`think()` → 判别 → 结论）在实测中对所有输入返回同一句话。当前状态下，心虫作为"AGI 第 1 层辨别者"的核心价值主张**未被实测支持**。

---

## 二、做对了什么（先确认资产）

以下均为实测通过项，不是文档自述：

1. **引擎可加载、可启停**：`new HeartFlow({silent:true})` + `start()` 正常，`modules_registered = 132`，`initErrors = 0`。
2. **自检脚本真实有效**：`node bin/verify.js` → **14 passed, 0 failed**（含"模块数 ≥ 124"、"dispatch 路由可用"、"think() 可用"、"扫描新增明文记忆"）。
3. **模块测试全绿**：`node test/run-all.js` → **410 通过, 0 失败**，跑完约 5 分钟无崩溃。
4. **MCP 服务真的在跑**：`initialize` 返回 `serverInfo: {name: "heartflow-mcp", version: "6.7.23"}`，`tools/list` 返回 **165 个工具**，实测调用 `heartflow_status` / `heartflow_think` / `heartflow_memory_search` 均成功返回。
5. **Hermes 已接通**：`config.yaml` 中 `mcp_servers.heartflow.url = http://127.0.0.1:8588/mcp`，`hermes mcp list` 显示 `✓ enabled`；端口 8588 监听中（pid 193），无 token 请求返回 401（鉴权中间件正常工作）。
6. **无硬编码密钥入库**：全库扫描 `ghp_` / `sk-` / `ck_` / `AKIA` 只命中测试文件的假样例；`.env` / `.mcp.env` 已被 `.gitignore` 覆盖。
7. **稳定性边界良好**：空输入、2 万字符长输入、纯特殊字符、提示注入文本，全部不崩溃（长输入 3.3s，其余 <200ms）。
8. **决策路由模块本身可用**：直调 `decisionRouter.evaluate()`，高负荷 → `heal`(0.69) / 低质量 → `pause`(0.94)，规则命中正常。
9. **记忆读取可用**：`hf.memory.countCore() = 34`，`countLearned() = 1041`，`memory.search('心虫')` 返回 11 条命中。
10. **逻辑推理单元测试通过**：`test/logic-reasoning.test.js` → 9 通过 0 失败。

---

## 三、问题清单（按严重度）

### 🔴 P0-1：判别结论恒为固定文案 —— 核心能力未生效

**现象（实测，非推断）**

| 输入 | `think()` 结论 | confidence | 任务类型 |
|---|---|---|---|
| `气死了，改了两天的bug还没好` | `不知道，缺少关键信息 需要更多信息` | 0.3 | general |
| `我想辞职去创业`（CLI `--chat`） | `不知道，缺少关键信息 需要更多信息` | — | general |
| 2 万字符长文 | 同上 | — | general |
| 提示注入文本 | 同上 | — | general |

CLI 实际输出（`node bin/cli.js --chat "我想辞职去创业"`）：

```
━━━ 情绪判断 ━━━
不知道，缺少关键信息 需要更多信息
未捕获思维链
━━━ 问题定位 ━━━
核心问题：不知道，缺少关键信息 需要更多信息
问题领域：general       严重程度：unknown
━━━ 行动建议 ━━━
1. 不知道，缺少关键信息 需要更多信息
```

MCP 通道 `heartflow_think` 返回内容与 CLI **完全同源**（同样的"未捕获思维链"/"general"/"unknown"）。

**根因线索**：`think()` 的 PARSE 阶段 `strategy.depth=3`、`type=general`，HYPOTHESES 阶段 `count=0` → INVERT 阶段 `reason="no_hypothesis"` → EVIDENCE 阶段 `evidenceForHypotheses=[]` → SYNTHESIS 落到兜底分支"需要更多信息"。这是一条**设计上的兜底路径**，被几乎全部输入触发。

**为什么是 P0**：心虫的全部价值主张是"在 AI 输出到达人类之前说'不'"。当结论恒定，"说不"的能力就不存在。这不是性能问题，是产品定义问题。

**附带结构缺陷**：`think()` 返回结构本身不含 `cognition` 字段。`heartflow-benchmark` 技能文档全篇基于 `r.cognition.decision` / `r.cognition.whatIsThis.emotion` 等路径做评测——**该 API 契约在当前版本已不存在**。任何按旧文档写的评测脚本都会静默得到 `undefined`，进而得出"全部通过"或"全部失败"的假结论。

---

### 🔴 P0-2：`verdict` 与 `gate.action` 自相矛盾，假信息拿到高分

对 `地球是平的，这是毋庸置疑的。` 实测：

```
gate.action = "rewrite"
verdict     = "可信"
score       = 0.82
findings    = 2
```

对 `根据2025年哈佛研究，喝咖啡能延长寿命12.5年，这绝对确定。` 实测：

```
gate.action = "verify"
verdict     = "可信"
score       = 0.82
findings[0] = { dimension: "unsupported_claim", severity: 90,
                details: "无依据断言(2处: 根据2025年哈佛研究)", guidance: "补充可验证的数据来源..." }
```

**问题**：底层 `findings` 正确识别了"无依据断言"（severity 90，最高档），但**对外 `verdict` 仍为"可信"、`overallScore` 固定 0.82**。上层调用者若读 `verdict`（最直观的字段），会把编造的"哈佛研究"当作可信内容放行。

**另**：MCP `heartflow_discriminate(text=...)` 对"地球是平的"同样返回 `verdict: "可信", overallScore: 0.82` —— 一个为真的断言和一个为假的断言拿到**完全相同的分数**。0.82 看起来是基线常数，不具备区分度。

---

### 🔴 P0-3：记忆系统双轨断裂，MCP 视角记忆为 0

实测同一时刻两个视角：

| 视角 | core | learned | ephemeral |
|---|---|---|---|
| 引擎直连 `hf.memory.countCore()` | **34** | **1041** | 0 |
| MCP `heartflow_status` → `memoryLayers` | **0** | **0** | **0** |
| `hf.memoryBank.getStats()` | **0** | **0** | **0** |

**根因**：存在两套并存且互不相通的记忆实现：
- `src/memory/heartflow-memory.js`（`hf.memory`）—— 平铺 JSON 文件层，有 34/1041 条数据
- `src/memory/memory-bank.js`（`hf.memoryBank`）—— 加密 MemoryBank 层，启动日志明确打印 `Loaded memory bank (encrypted): 0 memories, 0 sessions`

MCP 工具读的是 MemoryBank，**永远返回 0**。

**两个衍生质量问题**（数据已存但不可用）：

1. **CORE 层混入了对话原文**。实测 `listCore()` 中夹杂整段用户对话，例如：
   > `供应商三次来料不合格（第一次9折、第二次9折、第三次我提退货被领导否），领导要求让供应商出保证函…`
   
   CORE 层的语义应是身份规则/长期约束（确实也存了正确的 `heartflow_identity`、`core-directive-upgrade`），混入原始对话会污染检索。

2. **LEARNED 层 1041 条以模板化垃圾为主**。抽样：
   - `input: "测试核心管线"` × 多条
   - `input: "继续"` → `judgment: "简短输入，需要推断意图…"` → `accessCount: 0`
   - `input: "深度分析：评估认知引擎的元认知状态…"`
   
   全部 `accessCount: 0`、`lastAccessed` 等于 `createdAt` —— 写入后**从未被命中过一次**。learned : core ≈ 31:1，属于只写不读的堆积。

---

### 🟠 P1-4：能力接线率低 —— 154 个懒加载模块，约 10 个进入 think()

- `_lazy()` 注册键：**154 个**
- `think()` 方法体内被引用的懒加载模块：**约 10 个**
- 未被 `think()` 引用的样本：`adaptivePlanner`、`agentPhilosophy`、`beingLogic`、`beingMode`、`causalInference`、`cognitiveEngine`、`decisionEngineV2`、`debateConvergence`、`dualPerspectiveAuditor`、`dreamEngine`…

这不等于死代码（部分可通过 `dispatch()` 与 MCP 工具单独触达），但**"装载了" ≠ "在判别链路里起作用"**。当前 132 模块的对外数字与实际参与判别的模块数量之间存在显著落差。

---

### 🟠 P1-5：16 个 `src/core` 模块全库零引用

对 84 个 `src/core/*.js` 逐个统计被 `require` 的次数，以下 16 个**在任何 .js 中都未被引用**：

```
code-verifier    config-hooks     config-v2        engine-behavior
engine-constructor  engine-dispatcher  engine-hook-points  engine-initializer
engine-state     event-hooks      hook-bus         module-registry
openalex-client  request-hooks    route-whitelist  stats-engine
```

值得注意的是 `hook-bus` / `request-hooks` / `event-hooks` / `engine-hook-points` / `config-hooks` —— 五个钩子类模块全部零引用，与技能文档中 `heartflow-hookbus-migration`（钩子总线迁移）的描述**互相矛盾**：迁移未见落地。

---

### 🟠 P1-6：测试套件半失效 —— 44 个测试文件从未执行

| 项 | 实测 |
|---|---|
| `test/` 顶层测试文件 | 167 |
| `test/` 嵌套子目录测试文件 | **44**（core 13、utils 7、memory 6、knowledge 4、reasoning 3、cortex 3、identity 2、psychology/search/workflow/compliance 各 1…） |
| `test/run-all.js` 扫描方式 | `fs.readdirSync(TEST_DIR)` —— **非递归** |
| 结果 | 44 个嵌套测试**从未被跑过**，报告里的 410 全绿不含它们 |

**并且这 44 个文件即使被跑到也是坏的**：它们写的是 `require('../src/core/version.js')`，而它们位于 `test/core/`，相对解析结果是 `test/src/core/version.js` —— 不存在。实测：

```
$ node test/core/version.test.js
SKIP version.test.js (MODULE_NOT_FOUND: Cannot find module '../src/core/version.js'...)

$ node test/core/heartflow.test.js
Error: Cannot find module '../src/core/heartflow.js'
```

正确路径应为 `../../src/core/...`。**问题不在测试文件本身，在上面那层目录结构**：`test/core/` 是照 `src/core/` 平行建的，但 require 深度没跟着变。

当前 `410 passed` 的真实含义是"**被扫到的**测试全绿"，不是"全部测试全绿"。

---

### 🟠 P1-7：文档数字与实际普遍不符

| 指标 | 文档声称 | 实测 |
|---|---|---|
| MCP 工具数 | `131`（SKILL.md §4）/ `129`（§171、§62） | **165**（`tools/list` 实测） |
| 模块数 | `129`（SKILL.md / AGENTS.md 多处） | **132**（运行时） |
| 判别维度 | 标题 `47维`，正文 `46 个`，AGENTS.md `46 dimensions` | 库内并存 |
| 版本（CHANGELOG 最新条） | `6.7.13` | 引擎 6.7.23（落后 10 个补丁） |
| 版本（README 最新条） | `v6.6.1` | 引擎 6.7.23（落后 22 个补丁） |

工具数从 129/131 涨到 165 —— **66 个工具的存在没有出现在任何对外文档里**。这不是措辞问题：工具暴露面本身是攻击面，`excessive agency` 类审计项正是针对此类"实际能力远超声明"。

---

### 🟠 P1-8：4 个版本源，3 个落后

| 源 | 值 | 状态 |
|---|---|---|
| `VERSION`（文件，mtime 09-12） | `6.7.23` | ✅ 基准 |
| `package.json` 同（09-15） | `6.7.23` | ✅ 一致 |
| 引擎运行时 `hf.version` | `6.7.23` | ✅ 一致 |
| `src/core/version.js` 兜底常量 | **`6.0.5`** | 🔴 落后 23 个 minor |
| `src/core/heartflow.js` 文件头注释 | **`HeartFlow v6.6.1`** | 🔴 落后 |
| `CHANGELOG.md` 顶部 | **`6.7.13`** | 🔴 落后 |
| `README.md` 版本表顶部 | **`v6.6.1`** | 🔴 落后 |

`version.js` 自述是"唯一真相源（Single Source of Truth）"，但它把 `VERSION` 文件当真相源，自己只留一个**已过期 23 个 minor 的兜底值**。一旦 `VERSION` 文件读失败（权限、打包遗漏），引擎会自报 6.0.5。

---

### 🟠 P1-9：仓库体积与入库语料

| 项 | 实测 |
|---|---|
| 工作区（排除 node_modules/.git） | **86MB** |
| `.git` | **133MB** |
| `formulas-corpus/` | **47MB**，其中 7 个文件已入库 |
| 已入库最大文件 | `formulas-corpus/formulareasoning/data/FormulaReasoning/train.json` **15.9MB** |
| 其余入库大文件 | `..._plus/train.json` 15.5MB、`formulareasoning_preference_data.jsonl` 10.2MB、`formulas/math/competition_math_train.json` 2.8MB |
| 另 | `hermes-lessons-final.tar.gz` **768KB** 已入库 |

`.npmignore` 已排除 `formulas-corpus/`（npm 包不受影响），但 **git 仓库承受全部体积**。每次 `git clone` 都要拉 47MB 语料，而语料与引擎运行无直接关系。

---

### 🟡 P2-10：事件循环阻塞（busy-wait）

```js
// src/circuit-breaker.js:62
while (Date.now() < deadline) { /* busy-wait */ }
```

同步忙等在 Node 单线程里会**完全堵死事件循环**——期间所有 HTTP 请求、MCP 调用、定时器全部停摆。熔断器本意是保护系统，这行代码在触发时反而会让整个引擎无响应。仅此 1 处（全库扫描确认）。

---

### 🟡 P2-11：git remote 内嵌明文 token

```
cell-520     https://mark-cell-520:ghp_GV...lFMx@github.com/mark-cell-520/heartflow-skills.git
sync-token   https://yun520-1:github...BCMk@github.com/yun520-1/mark-heartflow-skill.git
```

两个 remote 的 URL 里直接内嵌了 GitHub 凭据。`.git/config` 本身不入库，但该技能目录**整体是一个被同步/备份/分发的仓库**（`cell-520/heartflow-skills` remote 就是为此存在）——一旦 `.git` 目录被拷贝或打包分发，token 随之泄漏。建议改用 `gh auth setup-git` + credential helper，URL 中不放凭据。

---

### 🟡 P2-12：安全边界文件与生产代码混杂

| 文件 | 问题 |
|---|---|
| `data/.mcp_token_plain` | 文件名即"明文 token"，却未被 `.gitignore` 显式覆盖（实测 `git check-ignore` 只匹配到 `data/*.json` 规则，非本文件） |
| `memory/.aes-key`、`memory/.qtable-hmac-key` | 加密/HMAC 密钥落在仓库工作区内（已被 gitignore，但明文可读） |
| `src/core/version.js` 中的 `console.warn` | 与"生产代码无 console"的既有审计结论不符 |
| 全库 `console.log/error/warn/info/debug` | **1487 处** |
| `process.exit(` | **150 处**（其中 `src/` 与 `mcp/` 下 20 处属服务进程退出路径） |

---

### 🟡 P2-13：重复文件与目录噪声

实测内容级重复（MD5 相同）：

```
index.js  ==  dist/index.js                       (4013B, 同一文件)
src/repo-audit.js  ==  scripts/repo-audit.js      (6475B, 同一文件)
```

根目录堆积 **21 个 .md**，其中多份为历史审计残留且互相矛盾：
`AUDIT-v6.0.0.md`（2026-07-14 / v6.0.0）、`AUDIT_REPORT.md`（2026-07-14 / v6.0.0）、`heartflow-audit-report.md`（2026-09-03 / v6.7.13）、`DIAGNOSIS.md`（2026-07-25）、`CURRENT_STATE.md`（v6.0.65）、`FAILURE_REPORT.md`、`REFLECTION.md`、`ARCHITECTURE_REORG_v6.0.6.md`… 其中 `CURRENT_STATE.md` 自述版本 v6.0.65，与现状差 6 个 minor。

另有一个空文件：`tests/v2_0_19.test.js`（0 字节）。

---

### 🟡 P2-14：技能文档引用了已不存在的文件

`skills/heartflow-audit-upgrade-push/SKILL.md` 中 6 处引用：

```
MISS  src/core/self-audit.js
MISS  src/core/code-engine.js
MISS  scripts/lightweight-audit.js
MISS  scripts/manual-audit.sh
```

文档 §附录B 整节在讲如何调用 `require('./src/core/self-audit.js').runAudit({mode:'full'})`，而该文件已被删除。下次照文档执行的审计会直接失败。（正面解读：文档里"不要依赖 self-audit.js"的警告仍然成立，只是理由从"会 OOM"变成了"已不存在"。）

---

## 四、附录：实测证据索引

| 编号 | 验证项 | 命令 / 方式 | 结果 |
|---|---|---|---|
| A | 引擎加载 | `new HeartFlow({silent:true}).start()` | 132 模块，initErrors=0 |
| A | 稳定性 | 空/2万字符/特殊字符/注入 | 全部不崩溃 |
| B | 自检 | `node bin/verify.js` | 14 passed / 0 failed |
| B | 测试套件 | `node test/run-all.js` | 410 passed / 0 failed |
| B | 嵌套测试 | `node test/core/version.test.js` | MODULE_NOT_FOUND |
| C | 情绪矩阵 | 8 组样本经 `think()` | 3/8 正确，anger/ pain/ tired → neutral |
| C | 逻辑矩阵 | `lr.analyze()` 5 例 | 5/5 判为 `deductive`，含误报（modus ponens 被判"虚假因果"） |
| C | 决策模块 | `decisionRouter.evaluate()` | 正常（heal 0.69 / pause 0.94） |
| D | MCP 握手 | `initialize` | `heartflow-mcp` v6.7.23 |
| D | MCP 工具数 | `tools/list` | **165** |
| D | MCP 记忆 | `heartflow_status` | core/learned/ephemeral **全 0** |
| E | 判别 | `heartflow_discriminate(text=假信息)` | `verdict: 可信`, score 0.82 |
| F | 记忆直连 | `hf.memory.countCore/countLearned` | 34 / 1041 |
| F | 门禁 | `gate.checkOutput(假信息)` | `action=rewrite` 但 `verdict=可信` |

---

## 五、修复优先级建议

若按"最小改动、最大收益"排序：

1. **先修 `think()` 兜底路径**（P0-1）——所有下游能力都依赖它。当前 HYPOTHESES=0 是整条链路的第一块多米诺。
2. **统一 `verdict` 与 `gate.action` 的取值口径**（P0-2）——`verdict` 必须由 `findings` 的严重度驱动，不能是常数 0.82。这是最便宜、最见效果的一行级修复。
3. **合并记忆双轨**（P0-3）——让 MCP 读 `hf.memory`，或让 MemoryBank 承接同一份数据。目前外部通过 MCP 看到的心虫是"没有记忆的心虫"。
4. **修复嵌套测试的 require 深度 + 让 `run-all.js` 递归**（P1-6）——否则后续任何修复都无法被 44 个测试覆盖。
5. **`src/circuit-breaker.js` 移除 busy-wait**（P2-10）——一行改动，消除整机僵死风险。
6. **清理 git remote 中的 token**（P2-11）——一行改动，消除凭据泄漏面。
7. 文档数字与版本对齐（P1-7、P1-8、P2-14）——批量文本替换，无功能风险。

---

*报告依据全部来自本机实测输出。标注为"实测"的每一条均可复现；未验证的推测已明确标注或省略。*
