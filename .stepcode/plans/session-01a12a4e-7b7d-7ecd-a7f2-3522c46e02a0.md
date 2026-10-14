# ProjectTest 功能扩展方案

## 一、现状盘点（已核实，非猜测）

**仓库状态**
- 全量测试：`487 passed`（16 warnings，其中 1 个是测试环境里 runner 线程调 `root.after` 报 `main thread is not in main loop`，不影响结果）。
- 有 3 个未提交改动文件 + 2 个未跟踪文件，主题是「响应内容内存预算」：
  - `core/settings.py`：新增 `response_memory_budget`（默认 2000 万字符）
  - `core/tester.py`：`CurlTester._run_once` 补上子进程/管道句柄统一回收（此前 32 并发 × 数千任务会积压未释放句柄，超时路径尤其危险）
  - `ui/main_window.py`：`_store_resp` 四级降级、`_resp_chars` 计数、批次运行中禁止切换文件、`_destroy` 定时器清理
- `debug2.txt`（25 MB，`latest` 软链指向它）是**另一个「doge」应用**的运行日志，最后停在一次成功的流式请求上，无崩溃痕迹，与本项目无关。
- `out/APIKeyTest.exe` 是 10月1日 的旧打包产物，落后于源码。

**已确认的真实能力缺口**（逐条读过代码，不是猜的）

| # | 缺口 | 证据 |
|---|------|------|
| 1 | **重试是「立即重试 + 不区分错误类型」**：无退避、无抖动，401/403/404 也照样重试 | `core/tester.py:195-204`，`attempts = max_retries + 1` 的 for 循环里只有 `on_progress` 回调，**没有任何 sleep，也没有错误分类** |
| 2 | **无并发限速**：32 并发直接打接口，易触发限流/被ban | 只有 `concurrency`（线程池大小），没有任何 QPS 控制 |
| 3 | **无 Key 自动轮换**：入口有 `savedApiKeys`，但要手动「批量试 Key」+「回填可用 Key」；批次测试中一个 key 401 就直接失败 | 无 `rotate` 相关模块 |
| 4 | **无 CLI**：`main.py` 只能起 GUI，服务器/CI/计划任务完全无法用 | `main.py` 全文 22 行，直接 `tk.Tk()` |
| 5 | **无生态互操作**：不能导入 NextChat / LobeChat / one-api·new-api 配置，也不能导出 | `config_parser` 只认自家 `presets` 格式 |
| 6 | **无告警**：定时整轮跑完只能本地看 | 无 notify 模块 |
| 7 | **无结构化运行日志** | 无 logging 落盘 |
| 8 | **结果检索弱**：Tab②/Tab③ 只有「排除此 URL/模型」，无跨列关键字/正则检索 | `kv_exclusions_dlg` 是排除而非检索 |
| 9 | **只有一套请求参数**：RequestSpec 无法命名保存多套预设 | `settings` 里是扁平的 `max_tokens_*` 几项 |
| 10 | **无 i18n** | 全部中文硬编码 |

> 说明：README 已列 A–X 共 24 项增强，基础并不薄。上面 10 条是**结构性缺口**，尤其是 1/2/4 三条直接影响「能不能在无人值守环境用、会不会把接口打封」。

---

## 二、方案总览

分 5 个 Phase，**每个 Phase 独立可交付、独立提交、独立测试**，可随时叫停。Phase 间低耦合，除 Phase 1 → 2（CLI 复用 Phase 1 的限速/重试）外无强顺序依赖。

```
Phase 0  基线固化          → 把 WIP 提交为检查点，锁定 487 passed 基线
Phase 1  请求链路健棒化    → 退避重试 / QPS 限速 / Key 轮换   （core 为主）
Phase 2  CLI 无界面模式    → main.py --cli，服务器与 CI 可用  （新 core/cli.py）
Phase 3  生态互操作        → 导入导出 NextChat/LobeChat/one-api/.env
Phase 4  告警与可观测性    → Webhook 通知 + 分级日志落盘
Phase 5  体验层            → 全局检索 / 参数预设管理 / i18n / 阶梯压测
```

### 硬约束（全程遵守，来自 CLAUDE.md）
1. **零第三方依赖**——只用标准库。这是项目的硬约束，`core/` 刻意保持零依赖。
2. **curl 是唯一请求执行方式**——所有测试/拉取/预检继续走 `subprocess` 调系统 curl，不引入 `http.client` 请求链路（Webhook 通知走标准库 `urllib` 是例外，属于外发通知而非测试链路）。
3. **绝不把明文 apiKey 写进任何新文件**——notify / log / CLI 输出 / 互操作导出一律脱敏或明确标注。
4. **`core/` 与 UI 解耦**——新逻辑优先做成 `core/` 纯函数，UI 只做装配。
5. **URL 归一化铁律**——任何解析入口必须过 `safe_normalize_base_url`，不自己拼 URL。
6. **Tk 控件只能主线程操作**——runner 线程一律 `root.after(0, ...)`。

---

## 三、Phase 详解

### Phase 0 — 基线固化（先行，必做）
- 把当前 WIP 作为一个检查点 commit（内容：响应内存预算 + curl 子进程回收 + 批次中禁止切文件），使后续扩展可回溯、可 revert。
- 记录基线：`487 passed`。后续每个 Phase 结束都要求全量绿。

### Phase 1 — 请求链路健壮化（core 为主，收益最高）

**新增模块**
- `core/retry.py`
  - `classify_failure(http_status, error_text) -> FailureKind`（`TIMEOUT / RATE_LIMITED / AUTH / NOT_FOUND / SERVER / NETWORK / OTHER`）
  - `should_retry(kind) -> bool`：仅 `TIMEOUT / RATE_LIMITED / SERVER / NETWORK` 可重试；`AUTH / NOT_FOUND / OTHER` 不重试（修掉「401 也重试 3 次白烧配额」）
  - `backoff_delays(attempt, base=0.5, cap=8.0, jitter=0.2, rng=None) -> List[float]`：确定性实现，`rng` 可注入 → 可单测
  - `is_retryable_error_text(text)`：识别 curl 的 `Connection timed out` / `Could not resolve host` / `Empty reply` / `HTTP 429` / `HTTP 5xx`
- `core/ratelimit.py`
  - `class RateLimiter`：线程安全令牌桶，`try_acquire()` / `acquire(timeout=None)`；`qps<=0` 时直通（零开销）
  - 单测覆盖：突发不超过桶容量、长时间运行速率收敛到 qps、多线程下不超发、timeout 行为
- `core/rotate.py`
  - `class KeyRotator`：按 URL 维护 key 序列 + 每个 key 的冷却截止时间；`next_key(url, exclude)` 返回下一个**未冷却**的 key；`mark_failed(url, key, cooldown_s)` / `mark_ok(url, key)` / `available(url)`
  - 纯逻辑、无 IO → 完整单测（冷却过期、全部冷却时回退到原 key、并发安全）

**改造**
- `core/tester.py`：`TesterConfig` 增加 `rate_limiter`、`retry_backoff_base/cap/jitter`、`retry_on: set`；`BaseTester.test` 改为「分类 → 该重试才重试 → 重试前 sleep(退避+抖动)」；`_run_once` 入口 `acquire()`
- `core/settings.py` 新增：`qps_limit`(0=不限)、`retry_backoff_base`(0.5)、`retry_backoff_cap`(8)、`retry_jitter`(0.2)、`key_rotate`(False)、`key_cooldown_s`(300)
- `ui/main_window.py`：工具栏新增 QPS 输入 + 「Key 轮换」勾选；批次启动时构造共享 `RateLimiter`/`KeyRotator`；`_expand_jobs` 在轮换开启时按 URL 选可用 key
- 新增 `tests/test_retry.py`、`tests/test_ratelimit.py`、`tests/test_rotate.py`、`tests/test_retry_integration.py`

**验收**：401 不再触发重试（省配额）；429/超时按 0.5→1→2s 退避；QPS=2 时 20 个任务总耗时 ≥ 8s；轮换下同一 URL 的第 2 个 key 在第 1 个 401 后被启用。

### Phase 2 — CLI 无界面模式（新 `core/cli.py`）

**用法**
```
python main.py --cli --source .doge --out out/report [--format json|csv|md|txt]
               [--concurrency 8] [--qps 4] [--timeout 30] [--retries 2]
               [--only-new] [--preflight] [--notify <url>] [--log-file logs/run.log]
               [--fail-on none|any|all] [--mask]
```

**要点**
- **CLI 路径绝不 import tkinter**（`main.py` 里按 `--cli` 分支走 `core.cli.main()`，GUI 分支才 `import tkinter`）——否则无显示环境直接崩。
- 复用 `config_parser` / `json_scanner` / `text_parser` / `tester` / `preflight` / `availability` / `snapshot`，不重写业务。
- 进度打印到 stdout（`\r` 刷新 + 阶段性汇总），可选 `--log-file` 落盘。
- **退出码可脚本化**：`--fail-on any` 时有任一失败即返回 1，`all` 时全失败才返回 1，`none` 恒 0 → 可直接接 CI / 计划任务。
- 输出报告默认脱敏（`--mask`），明文仅在显式 `--no-mask` 时出现，并在报告头打印醒目警告。
- 支持 `--source` 指向文件夹 / 单个 JSON / 自由文本文件（自动判别）。
- 新增 `tests/test_cli.py`（用 `http.server` 起本地 fixture：200 正常 / 401 / 超时三类，端到端验证退出码、报告字段、脱敏、`--only-new` 跳过）。

**验收**：在无显示环境（`TK_SILENCE_DEPRECATION` + 无 X）下 `python main.py --cli ...` 正常跑完并产出报告；GUI 行为零回归。

### Phase 3 — 生态互操作（新 `core/interop.py`）

**导入**（自动识别格式，导入前出预览对话框）
- NextChat / LobeChat 的 `*.json`（`models[].endpoint` / `settings.key` 结构）
- one-api / new-api 的渠道导出（`type: 1` OpenAI 兼容，取 `base_url` + `key` + `models`）
- `.env` / 环境变量风格（`OPENAI_BASE_URL=` / `OPENAI_API_KEY=` / `*_MODEL=`）
- 自由文本（直接复用 `text_parser`，不重复实现）

**导出**
- 上述格式反向 + `.env` + `models.json`
- 导出对话框带「脱敏 Key」勾选（默认开）

**约束**：所有导入 URL 走 `safe_normalize_base_url`； Anthropic 系与 `/vX/chat/completions`（X≠1）按铁律不改写版本段；导入预览里标出「未归一化已自动修复」「跳过（缺 URL）」等。

**新增** `tests/test_interop.py`（每种格式 round-trip + 归一化 + 缺字段跳过 + 脱敏导出）。

### Phase 4 — 告警与可观测性

- `core/notify.py`
  - `send_webhook(url, title, lines, kind="auto")`：按 URL 形态判别 钉钉 / 飞书 / Server酱 / Bark / 自定义 JSON POST，统一用标准库 `urllib.request`
  - **只发入口名 / URL / 状态 / 错误归类，Key 一律脱敏**；单测断言 payload 里不含明文 key
  - 发送失败静默（不打断主流程），带超时
- `core/logx.py`
  - `get_logger(name)`：分级（DEBUG/INFO/WARNING/ERROR）+ `logs/run_YYYYMMDD.log` 落盘 + 简单轮转（超过 N MB 改名）
  - CLI 与 GUI 共用；GUI 里「查看运行日志」菜单项直接打开当日日志
- 接入点：定时整轮 / 定时重测完成后，若出现**新失效**或**已恢复**，推送一条汇总（复用 `snapshot.diff_snapshots` 的判定）。
- 新增 `tests/test_notify.py`（本地起 HTTP server 收 payload，验证各类 webhook 形态与脱敏）、`tests/test_logx.py`。

### Phase 5 — 体验层

- **全局检索栏**：Tab②/Tab③ 顶部加「检索」框，跨所有列做大小写不敏感匹配 + 可选正则 + 「仅看失败/仅看成功」；与既有「排除」机制叠加。
- **请求参数预设管理**：`core/reqspec_store.py` 命名保存多套 RequestSpec（默认/限长/流式/自定义 Header…），工具栏下拉一键切换，落盘 `req_presets.json`（不含 key）。
- **i18n**：`core/i18n.py` 字典 + `tr()`，工具栏/菜单/状态栏/弹窗先覆盖，表格列名与结果说明随后；中英切换持久化到 `settings.lang`。
- **压测增强**：阶梯加压（`ramp_from → ramp_to`，每步 N 秒）+ 持续时长模式；报告增加「爬坡期 vs 稳态期」成功率对比，用于判断接口的容量拐点。
- 新增 `tests/test_search.py`、`tests/test_reqspec_store.py`、`tests/test_i18n.py`、`tests/test_stress_ramp.py`。

---

## 四、明确不做

- **不引入任何第三方依赖**（硬约束，`requirements.txt` 保持空）。
- **不用 Python 自带 HTTP 客户端替换 curl** 做测试链路（curl 是唯一执行方式的铁律）。
- **不写明文 key 到任何新文件**；`notify` / `log` / CLI / 互操作导出一律脱敏或显式警告。
- **不改 `.doge/` 目录语义**，不新增对它的隐式假设。
- **不做 TUI（curses）**——与 CLI 的 stdout 输出重复，收益低。
- **不动既有 A–X 功能的行为**，全部为增量；新 UI 统一 `_feat_*` / 明确前缀命名，避免与 5100 行单文件里的既有控件名冲突。

---

## 五、验证策略

每个 Phase 结束都必须过：

1. **全量测试**：`python -m pytest tests/ -q` 全绿，且数量只增不减（基线 487）。
2. **新增单测**：core 纯函数优先做到分支全覆盖；GUI 部分用仓库既有模式（隐藏 root + `MainWindow` 冒烟，参考 `_smoke9.py` / `tests/test_kv_gui.py`）。
3. **CLI 端到端**：本地 `http.server` fixture 造 200/401/超时三类响应，验证退出码、报告字段、脱敏、`--only-new`。
4. **安全自检**：对新增的每条导出/通知/日志路径 grep，确认无明文 key 落盘；确认 `settings.json` 仍只含白名单字段。
5. **GUI 冒烟**：新控件可点、不崩、不破坏既有三 Tab 与主题重建（主题重建会重建整棵控件树，新控件必须在 `_ui()` 里创建才能被正确处理——这是既有约束）。
6. **每个 Phase 一个 commit**，消息风格遵循仓库既有的中文详细格式（问题→根因→修复→测试→全量数）。

---

## 六、风险与缓解

| 风险 | 缓解 |
|------|------|
| `ui/main_window.py` 单文件 ~5100 行，新增 UI 易撞名/破坏主题重建 | 新控件统一前缀；一律在 `_ui()` 内创建；GUI 冒烟覆盖「切换主题 → 数据与 iid 映射保留」 |
| CLI 误 import tkinter 导致无显示环境崩溃 | `main.py` 按 `--cli` 分支隔离；新增测试在无显示模式下跑 CLI |
| 退避重试拉长批次总时长 | 退避上限默认 8s、可配；`should_retry` 排除 4xx；状态栏实时显示重试进度 |
| Key 轮换可能「掩盖 key 失效」导致 done_set 记录错误 | 轮换只换「发送用的 key」，done_set 仍记录**实际成功**的那个 key 的哈希 |
| Webhook 外发可能泄露 | payload 构造走统一的脱敏函数，单测断言；默认关闭，需显式配置 |
| 互操作导入把脏数据写进 `.doge` | 导入只进内存/预览对话框，落盘必须用户显式确认；绝不由工具自动写含真实 key 的文件 |

---

## 七、建议执行顺序

**Phase 0 → 1 → 2 优先**（这三步把工具从「只能桌面点按钮」变成「可无人值守、可编排、不打封接口」），Phase 3–5 按需追加。

如果只想先要一部分，建议最小有效集：**Phase 1（退避重试 + QPS 限速）+ Phase 2（CLI）**——改动集中在 `core/`，不碰 UI 主流程，风险最低、收益最直接。
