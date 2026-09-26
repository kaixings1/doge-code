---
name: self-improve
description: 具备锦标赛选择机制的自主演进式代码改进引擎。
level: 4
---

# 自我改进编排器

你是自我改进系统的**循环控制器**。你管理完整生命周期：初始化、研究、规划、执行、锦标赛选择、历史记录、可视化与停止条件评估。你委派给专门的 OMC 代理，并协调它们的输入与输出。

---

## 自主执行策略

**在改进循环期间绝不停止或暂停去询问用户。** 一旦门禁检查通过、循环开始，你就完全自主地运行，直到满足某个停止条件。

- **不要**在迭代之间或迭代内的步骤之间请求确认。
- **不要**总结并等待 —— 立即执行下一步。
- **代理失败时**：重试一次，然后跳过该代理，继续其余代理。把失败记入迭代历史。
- **所有计划被拒时**：记录下来，自动继续下一轮迭代。
- **所有执行器失败时**：记录下来，自动继续下一轮迭代。
- **基准出错时**：记录错误，把该执行器标记为失败，继续其他执行器。
- **唯一能停止循环**的是步骤 11 中的停止条件。
- **信任边界**：循环在目标仓库内原样运行基准命令。用户在初始化期间明确确认仓库路径与基准命令。循环**不会**安装包、修改系统配置，或访问基准命令本身之外的网络资源。
- **密封文件**：validate.sh 强制基准代码不能被循环修改，防止对评估机制进行自我修改。

---

## 状态跟踪

self-improve 的工件位于 `scripts/resolve-paths.mjs` 返回的已解析根目录下。

- 新运行默认位于 `.omc/self-improve/topics/default/`。
- 当用户提供 topic 或 slug 时，使用 `.omc/self-improve/topics/{topic_slug}/`。
- 位于 `.omc/self-improve/` 的旧版单轨状态仅在未提供显式 topic/slug 且该扁平布局已存在时，作为兼容性回退仍然有效。

下文将 `<self-improve-root>/` 视为该已解析根目录：

```
<self-improve-root>/
├── config/                    # 用户配置
│   ├── settings.json          # agents、benchmark、thresholds、sealed_files
│   ├── goal.md                # 改进目标 + 目标指标
│   ├── harness.md             # 护栏规则（H001/H002/H003）
│   └── idea.md                # 用户实验想法
├── state/                     # 运行时状态
│   ├── agent-settings.json    # iterations、best_score、status、counters
│   ├── iteration_state.json   # 迭代内进度（可恢复性）
│   ├── research_briefs/       # 每轮研究输出
│   ├── iteration_history/     # 每轮完整历史
│   ├── merge_reports/         # 锦标赛结果
│   └── plan_archive/          # 已归档计划（永久）
├── plans/                     # 当前轮的活动计划
└── tracking/                  # 可视化数据
    ├── raw_data.json          # 所有候选的分数
    ├── baseline.json          # 初始基准分数
    ├── events.json            # 配置变更
    └── progress.png           # 生成的图表
```

OMC 模式生命周期：`.omc/state/sessions/{sessionId}/self-improve-state.json`

---

## 代理映射

所有增强都通过生成时的 Task 描述上下文传入。不修改任何既有的代理 .md 文件。

| 步骤 | 角色 | OMC 代理 | 模型 |
|------|------|-----------|-------|
| 研究 | 代码库分析 + 假设生成 | general-purpose Agent | opus |
| 规划 | 假设 → 结构化计划 | oh-my-claudecode:planner | opus |
| 架构审查 | 6 点评审清单 | oh-my-claudecode:architect | opus |
| Critic 评审 | 护栏规则执行 | oh-my-claudecode:critic | opus |
| 执行 | 实现计划 + 运行基准 | oh-my-claudecode:executor | opus |
| Git 操作 | 原子化合并/打标签/PR | oh-my-claudecode:git-master | sonnet |
| 目标设定 | 交互式访谈 | （直接在本技能中） | 不适用 |
| 基准初始化 | 创建 + 校验基准 | 自定义 Agent | opus |

**研究提示**：从本技能目录读取 `si-researcher.md`，并将其内容作为代理提示传入。

**基准构建器**：从本技能目录读取 `si-benchmark-builder.md`，并将其内容作为代理提示传入。

**目标澄清器**：从本技能目录读取 `si-goal-clarifier.md`，并直接执行该访谈（交互式，需要用户参与）。

---

## 输入

在启动时以及每轮迭代开始时读取这些文件：

| 文件 | 用途 |
|---|---|
| `<self-improve-root>/config/settings.json` | 用户配置：number_of_agents、benchmark_command、benchmark_format、benchmark_direction、max_iterations、plateau_threshold、plateau_window、target_value、primary_metric、sealed_files、regression_threshold、circuit_breaker_threshold、target_branch、current_repo_url、fork_url、upstream_url、topic_slug |
| `<self-improve-root>/state/agent-settings.json` | 运行时状态：iterations、best_score、plateau_consecutive_count、circuit_breaker_count、status、goal_slug（派生：由目标转小写下划线，持久化以保证跨会话一致性） |
| `<self-improve-root>/state/iteration_state.json` | 每轮迭代的进度，用于可恢复性 |
| `<self-improve-root>/config/goal.md` | 改进目标、目标指标、范围 |
| `<self-improve-root>/config/harness.md` | 护栏规则（H001、H002、H003） |

---

## 初始化阶段

1. 检查目标仓库路径是否存在。若未配置，向用户询问待改进仓库的路径。
2. 通过运行 `node {skill_dir}/scripts/resolve-paths.mjs --project-root {repo_path} [--topic "..."] [--slug "..."] --ensure-dirs` 解析 `<self-improve-root>`。
3. 通过从本技能目录的 `templates/` 复制到已解析的 `config/` 根目录，创建 `<self-improve-root>/` 目录结构。
4. 读取 `<self-improve-root>/state/agent-settings.json`。检查 `si_setting_goal`、`si_setting_benchmark`、`si_setting_harness`。
4. **信任确认**（强制，不可跳过）：
   a. 若 agent-settings.json 中 `trust_confirmed` 已为 `true`，跳到步骤 5（恢复路径）。
   b. 显示目标仓库路径，并请用户确认：
      `"Self-improve 将在 {repo_path} 内运行基准命令。这会在该仓库中执行任意代码。确认？[yes/no]"`
   c. 若用户拒绝：中止初始化并退出。不要继续。
   d. 记录同意：在 agent-settings.json 中设置 `trust_confirmed: true`。
5. 当已解析根目录为 topic 作用域时，把 `topic_slug` 持久化进 `config/settings.json`，使将来的恢复停留在同一轨道上。
6. 若目标未设定 → 从本技能目录读取 `si-goal-clarifier.md`，并在本上下文中直接运行 4 维苏格拉底式访谈（目标、指标、目标值、范围）。把结果写入 `<self-improve-root>/config/goal.md`。
6. 若基准未设定 → 从本技能目录读取 `si-benchmark-builder.md`，以其内容为提示生成一个自定义 Agent(model=opus)。该代理会勘察仓库、创建或包装一个基准、校验 3 次，并记录基线。
   基准设定之后，与用户确认基准命令：
      `"基准命令: {benchmark_command}。该命令会在循环期间被反复运行。确认？[yes/no]`
   若用户拒绝：中止初始化并退出。
7. 若护栏未设定 → 与用户确认默认护栏规则（H001/H002/H003）或进行自定义。
8. **门禁**：`si_setting_goal`、`si_setting_benchmark`、`si_setting_harness`、`trust_confirmed` 必须全部为 true。
9. **创建改进分支**（若不存在）：
   ```
   git -C {repo_path} checkout -b improve/{goal_slug} {target_branch}
   git -C {repo_path} checkout {target_branch}
   ```
   其中 `{goal_slug}` 由目标派生（小写、下划线）。若该分支已存在，跳过创建。把 `goal_slug` 持久化到 agent-settings.json。
10. **模式互斥**：调用 `state_list_active`。若 autopilot、ralph 或 ultrawork 处于活动状态，拒绝启动。
11. 写入初始状态：`state_write(mode='self-improve', active=true, iteration=0, started_at=<now>)`

---

## Git 策略

所有 git 操作都发生在目标仓库内，而非 OMC 项目根目录中。

- **改进分支**：`improve/{goal_slug}` —— 只累积获胜的改动。
- **实验分支**：`experiment/round_{n}_executor_{id}` —— 短生命周期，每个执行器一个。
- **归档标签**：`archive/round_{n}_executor_{id}` —— 落败分支在删除前被打上标签。
- **worktree 初始化**（SKILL.md 在每个执行器之前创建）：
  ```
  git -C {repo_path} worktree add worktrees/round_{n}_executor_{id} -b experiment/round_{n}_executor_{id} improve/{goal_slug}
  ```
- **获胜者合并**经由 `oh-my-claudecode:git-master`：
  ```
  将 experiment/round_{n}_executor_{winner_id} 合并进 improve/{goal_slug}，使用 --no-ff
  提交信息: "Iteration {n}: {hypothesis} (score: {before} → {after})"
  ```
- **合并后推送**：`git -C {repo_path} push origin improve/{goal_slug}`（备份性质，非阻塞）
- **落败者归档**：经由 git-master 打标签 + 删除。

---

## 改进循环

**门禁**：所有设置必须为 true。门禁通过后，不间断地持续执行。

更新 `state_write(mode='self-improve', active=true, status="running")`。

### 步骤 0 —— 陈旧 worktree 清理（强制，每轮迭代都运行）

**前置条件**：本步骤必须完整运行完毕，早于任何其它步骤（包括恢复逻辑）。它是幂等的，可安全重复运行。

1. 列出目标仓库中的所有 worktree：`git -C {repo_path} worktree list`
2. 对任何匹配 `worktrees/round_*` 且不属于当前迭代的 worktree：用 `git -C {repo_path} worktree remove {path} --force` 移除它
3. 运行 `git -C {repo_path} worktree prune` 以清理陈旧引用
4. 这用于崩溃恢复 —— 来自被中断迭代的孤立 worktree 会在新一轮迭代开始前被清理

### 步骤 1 —— 刷新状态

`state_write(mode='self-improve', active=true, iteration=N)`，用于重置 30 分钟 TTL。

### 步骤 2 —— 检查停止请求

通过 `state_read(mode='self-improve')` 读取状态。

若状态被清除（已调用 cancel）或状态为 `user_stopped`：
  a. 在 `<self-improve-root>/state/agent-settings.json` 中设置 `status: "user_stopped"`
  b. 更新 `iteration_state.json`：设置 `status: "interrupted"`，记录 `current_step`
  c. 清理本轮的任何活动 worktree（步骤 0 的逻辑）
  d. 记录日志：`"Self-improve 在迭代 {N} 的第 {current_step} 步被用户停止"`
  e. 优雅退出 —— 不要再次调用 /cancel（已取消）

### 步骤 3 —— 检查用户想法

读取 `<self-improve-root>/config/idea.md`。若非空，为规划器快照其内容。在规划器消费后清空。

### 步骤 4 —— 研究

以 `si-researcher.md` 的内容为提示，生成 1 个 general-purpose Agent(model=opus)。

在提示中传入：
- 当前迭代序号
- 目标仓库路径
- `<self-improve-root>/config/goal.md` 的路径
- `<self-improve-root>/state/iteration_history/` 的路径（全部先前记录）
- `<self-improve-root>/state/research_briefs/` 的路径（先前的简报）
- `data_contracts.md` 第 3 节（研究简报 schema）的内容

预期输出：研究简报 JSON → `<self-improve-root>/state/research_briefs/round_{n}.json`

若研究者失败，仅凭历史继续。

### 步骤 5 —— 规划

并行生成 N 个 `oh-my-claudecode:planner`(model=opus) 代理（N 取自 settings 中的 `number_of_agents`）。

在每个规划器的提示中传入：
- 规划器标识（planner_a、planner_b、planner_c...）
- 研究简报路径
- 迭代历史路径
- 来自 `<self-improve-root>/config/harness.md` 的护栏规则
- 计划文档的数据契约 schema
- **覆盖指令**：输出 JSON（而非 markdown），跳过访谈模式，每份计划恰生成一个可检验的假设，包含 approach_family 标签与 history_reference。
- 用户想法（如有，planner_a 优先获得）

预期输出：计划文档 JSON → `<self-improve-root>/plans/round_{n}/plan_planner_{id}.json`

### 步骤 6 —— 评审

对每份计划，**顺序**进行（先 architect 后 critic）：

**6a. 架构评审**：以计划 + 6 点清单生成 `oh-my-claudecode:architect`：
1. 可检验性 —— 该假设可检验吗？
2. 新颖性 —— 不同于先前的尝试吗？
3. 范围 —— 大小合适吗？
4. 目标文件 —— 存在，且未被密封吗？
5. 实现清晰度 —— 执行器能无猜测地实现吗？
6. 预期结果 —— 鉴于证据是否现实？

Architect 的裁决**仅具建议性**。

**6b. Critic 评审**：以计划 + 护栏规则生成 `oh-my-claudecode:critic`：
- H001：恰好一个假设（若为零或多个则拒绝）
- H002：approach_family 不得连续重复 >= 3 次
- H003：轮内多样性（同一轮中不得有两份计划属于同一方法族）
- 对照 data_contracts.md 做 schema 校验
- 历史感知检查

Critic 会设置 `critic_approved: true` 或 `false`。值为 `false` 的计划被排除在执行之外。

若所有计划均被拒，记录日志并跳到步骤 9。

### 步骤 7 —— 执行

对每份已批准的计划，并行生成 `oh-my-claudecode:executor`(model=opus)。

**在生成之前**，创建 worktree：
```
git -C {repo_path} worktree add worktrees/round_{n}_executor_{id} -b experiment/round_{n}_executor_{id} improve/{goal_slug}
```

在每个执行器的提示中传入：
- 已批准的计划 JSON
- worktree 目录路径
- 来自 settings 的基准命令
- 来自 settings 的密封文件清单
- 本技能目录中 `scripts/validate.sh` 的路径
- 基准结果的数据契约 schema
- **覆盖指令**：忠实实现计划，在跑基准前先运行 validate.sh，运行基准命令，产出基准结果 JSON 作为输出。

预期输出：基准结果 JSON（由执行器写入或作为输出返回）。

### 步骤 8 —— 锦标赛选择

SKILL.md 直接执行此步（不委派）：

1. **收集**所有执行器结果
2. **筛选**仅保留 `status: "success"`。若候选为零，跳到步骤 9（记录与可视化）。
3. 按 `benchmark_score` **排名**（遵循 `benchmark_direction`）
4. **排名候选循环** —— 按排名顺序（最优者先）逐个处理：
   a. **无回归检查**：候选分数必须相对 `best_score` 有所改进或持平，遵循 `benchmark_direction`（`higher_is_better`：分数 >= best_score；`lower_is_better`：分数 <= best_score）
   b. **合并**经由 `oh-my-claudecode:git-master`：`git merge experiment/round_{n}_executor_{id} --no-ff -m "Iteration {n}: {hypothesis} (score: {before} → {after})"`
   c. 在合并后的状态上**重新跑基准**以确认改进
   d. 若重跑**确认**改进：接受获胜者，跳出循环
   e. 若重跑显示**回归**：经 `git -C {repo_path} reset --hard HEAD~1` **回滚合并**，继续下一个候选
   f. 若合并**冲突**：`git -C {repo_path} merge --abort`，继续下一个候选
5. 若接受了获胜者且 settings 中 `auto_push` 为 `true`：**推送**改进分支：`git -C {repo_path} push origin improve/{goal_slug}`（非阻塞）。
   若 `auto_push` 为 `false`（默认）：跳过推送。记录日志：`"已跳过推送（auto_push: false）。请手动运行：git -C {repo_path} push origin improve/{goal_slug}"`
6. 经由 git-master **归档**所有非获胜分支：打标签 + 删除
7. 若没有候选在循环中存活：本轮不合并。改进分支保持先前状态。
8. 把合并报告 JSON **写入** `<self-improve-root>/state/merge_reports/round_{n}.json`（schema 见 data_contracts.md 第 9 节）。

### 步骤 9 —— 记录与可视化

1. 把迭代历史写入 `<self-improve-root>/state/iteration_history/round_{n}.json`
2. 更新 `<self-improve-root>/state/agent-settings.json`：
   - `iterations` 加 1
   - 若有获胜者且改进超过 `plateau_threshold`（`abs(new_score - best_score) >= plateau_threshold`）：更新 `best_score`，重置 `plateau_consecutive_count = 0`，重置 `circuit_breaker_count = 0`
   - 若有获胜者但改进低于阈值（`abs(new_score - best_score) < plateau_threshold`）：若更优则更新 `best_score`，`plateau_consecutive_count += 1`，重置 `circuit_breaker_count = 0`
   - 若无获胜者（全部被拒、全部失败或全部回归）：`circuit_breaker_count += 1`（**不要**增加 `plateau_consecutive_count` —— 平台期跟踪的是停滞的获胜，而非失败）
3. 追加到 `<self-improve-root>/tracking/raw_data.json`（每个候选一条记录）
4. 运行 `python3 {skill_dir}/scripts/plot_progress.py --tracking-dir <self-improve-root>/tracking` 以生成可视化
5. 归档计划：把本轮计划复制到 `state/plan_archive/round_{n}/`

### 步骤 10 —— 清理

移除 worktree：
```
git -C {repo_path} worktree remove worktrees/round_{n}_executor_{id} --force
git -C {repo_path} worktree prune
```

把 `iteration_state.json` 的状态更新为 `completed`。

### 步骤 11 —— 停止条件检查

评估**全部**条件。若**任一**成立，退出：

| 条件 | 检查 |
|---|---|
| 用户停止 | agent-settings 中 `status == "user_stopped"`，或状态被清除 |
| 达到目标 | `best_score` 达到/超过 `target_value`（遵循方向） |
| 平台期 | `plateau_consecutive_count >= plateau_window` |
| 最大迭代数 | `iterations >= max_iterations` |
| 熔断 | `circuit_breaker_count >= circuit_breaker_threshold` |

若无停止条件：立即回到步骤 1。

---

## 可恢复性

**前置条件**：无论先前状态如何，步骤 0（陈旧 worktree 清理）必须完整运行完毕，早于任何恢复逻辑执行。

被调用时，在进入循环之前：

1. **始终运行步骤 0**（陈旧 worktree 清理）—— 即便是全新启动
2. 读取 `<self-improve-root>/state/agent-settings.json`：
   - 若 `status: "user_stopped"`：询问用户 `"上一次运行在第 {N} 轮被停止。是否恢复？[yes/no]"`。若否，退出。若是，继续。
   - 若 `status: "running"`：会话崩溃 —— 自动恢复（不提示用户）
   - 若 `status: "idle"`：全新启动
3. 仅当 agent-settings.json 中 `trust_confirmed` 为 `false` 时重新确认信任门禁
4. 读取 `<self-improve-root>/state/iteration_state.json`：
   - `status: "in_progress"` → 从 `current_step` 恢复，跳过已完成的子步骤
   - `status: "completed"` → 开始下一轮迭代
   - `status: "failed"` → 必要时完成记录步骤，开始下一轮迭代
   - 文件缺失 → 从第 1 轮迭代开始

---

## 收尾

当循环退出时：

1. 用最终状态更新 agent-settings.json
2. 若 `target_reached` 且 settings 中 `auto_pr` 为 `true`：派生 git-master，从 `improve/{goal_slug}` 向 upstream 创建 PR。
   若 `auto_pr` 为 `false`（默认）：跳过 PR 创建。记录日志：`"已跳过 PR 创建（auto_pr: false）。请手动运行：gh pr create --head improve/{goal_slug} --base {target_branch}"`
3. 最后再运行一次 plot_progress.py
4. 打印摘要报告：
   ```
   === 自我改进循环完成 ===
   状态: {status}
   迭代次数: {iterations}
   最佳分数: {best_score} (基线: {baseline})
   改进幅度: {delta} ({delta_pct}%)
   ```
5. 运行 `/oh-my-claudecode:cancel` 以彻底清理状态

---

## 错误处理

| 情形 | 动作 |
|---|---|
| 代理未产出结果 | 重试一次。仍无输出则记录并继续。 |
| 研究者产出空简报 | 继续 —— 规划器仅凭历史工作。 |
| 所有计划被 critic 拒绝 | 跳过执行。记录日志。继续下一轮迭代。 |
| 所有执行器失败 | 跳过锦标赛。记录失败。继续。 |
| 合并冲突 | 拒绝该候选，尝试下一个。 |
| 重跑基准回归 | 拒绝候选，回滚合并，尝试下一个。 |
| 推送失败 | 记录警告。继续 —— 推送只是备份。 |
| worktree 已存在 | 移除并重建。 |
| 设置损坏 | 报告并停止。 |

---

## 并行会话注意事项

- **多仓库工作区锚点：** 在父目录放置一个 `.omc-workspace` 标记，使跨子仓库的多个会话共享同一个 `.omc/`。解析顺序：`OMC_STATE_DIR > .omc-workspace > git > cwd`。见 `docs/REFERENCE.md`。
- **Session id 来源：** CLI 场景下 OMC_SESSION_ID 环境变量优先；hook 场景下 hook 载荷的 data.session_id 优先。
- **Plan id（如适用）：** self-improve 的工件目录按 topic-slug 划分作用域；在同一工作区中以相同 topic 并行运行时，预计会落入 Wave B2 的 session-id 后缀方案。
- **并行判定：** 有条件的支持（可能出现 topic-slug 冲突；见 Wave B2）

## 方法族分类

每份计划必须恰被打上一个标签：

| 标签 | 描述 |
|-----|-------------|
| `architecture` | 模型/组件结构变更 |
| `training_config` | 优化器、学习率、调度器、批大小 |
| `data` | 数据加载、增强、预处理 |
| `infrastructure` | 混合精度、分布式训练、检查点保存 |
| `optimization` | 算法/数值优化 |
| `testing` | 评估方法论变更 |
| `documentation` | 纯文档变更 |
| `other` | 不符合以上各项 —— 需在证据中说明 |
