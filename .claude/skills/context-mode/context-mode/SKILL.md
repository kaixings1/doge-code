---
name: context-mode
description: |
  在处理大量输出时，用 context-mode 工具（ctx_execute、ctx_execute_file）代替 Bash/cat。触发词：analyze logs、summarize output、process data、parse JSON、filter results、extract errors、check build output、analyze dependencies、process API response、large file analysis、page snapshot、browser snapshot、DOM structure、inspect page、accessibility tree、Playwright snapshot、run tests、test output、coverage report、git log、recent commits、diff between branches、list containers、pod status、disk usage、fetch docs、API reference、index documentation、call API、check response、query results、find TODOs、count lines、codebase statistics、security audit、outdated packages、dependency tree、cloud resources、CI/CD output。任何可能超过 20 行的 MCP 工具输出也会触发。子代理路由通过 PreToolUse hook 自动处理。
---

# Context Mode：所有大输出量的默认选择

## 强制规则

<context_mode_logic>
  <mandatory_rule>
    所有命令默认使用 context-mode。仅在输出确定很小的操作中才用 Bash。
  </mandatory_rule>
</context_mode_logic>

Bash 白名单（可直接运行）：
- **文件修改**：mkdir、mv、cp、rm、touch、chmod
- **Git 写操作**：git add、git commit、git push、git checkout、git branch、git merge
- **导航**：cd、pwd、which
- **进程控制**：kill、pkill
- **包管理**：npm install、npm publish、pip install
- **简单输出**：echo、printf

**其它一切 → 使用 ctx_execute 或 ctx_execute_file。** 任何会读取、查询、抓取、列举、记录日志、测试、构建、比较差异、检查或调用外部服务的命令。这包括所有 CLI（gh、aws、kubectl、docker、terraform、wrangler、fly、heroku、gcloud 等），它们有成千上万个，无法逐一列出。

**不确定时就用 context-mode。** 每浪费 1KB 不必要的上下文，都会降低整场会话的质量与速度。

## 决策树

```
即将运行命令 / 读取文件 / 调用 API？
│
├── 命令在 Bash 白名单里（文件修改、git 写操作、导航、echo）？
│   └── 使用 Bash
│
├── 输出可能很大，或者你不确定？
│   └── 使用 context-mode 的 ctx_execute 或 ctx_execute_file
│
├── 抓取网页文档或 HTML 页面？
│   └── 使用 ctx_fetch_and_index → ctx_search
│
├── 使用 Playwright（navigate、snapshot、console、network）？
│   └── 始终用 filename 参数保存到文件，然后：
│       browser_snapshot(filename) → ctx_index(path) 或 ctx_execute_file(path)
│       browser_console_messages(filename) → ctx_execute_file(path)
│       browser_network_requests(filename) → ctx_execute_file(path)
│       ⚠ browser_navigate 会自动返回一份快照 —— 忽略它，
│         任何检查都用 browser_snapshot(filename)。
│       ⚠ Playwright MCP 只用一个浏览器实例 —— 不能并行。
│         并行浏览器操作请改用 execute 调用 agent-browser。
│
├── 使用 agent-browser（可并行的浏览器自动化）？
│   └── 通过 execute（shell）运行 —— 每次调用有独立子进程：
│       execute("agent-browser open example.com && agent-browser snapshot -i -c")
│       ✓ 支持会话，可隔离浏览器实例
│       ✓ 子代理并行执行安全
│       ✓ 轻量可访问性树，基于 ref 交互
│
├── 处理来自另一个 MCP 工具的输出（Context7、GitHub API 等）？
│   ├── 输出已在之前某次工具调用的上下文中？
│   │   └── 直接使用它。不要用 ctx_index(content: ...) 重新索引。
│   ├── 需要多次搜索该输出？
│   │   └── 用 ctx_execute 保存到文件，然后 ctx_index(path) → ctx_search
│   └── 一次性提取？
│       └── 用 ctx_execute 保存到文件，然后 ctx_execute_file(path)
│
└── 读取文件以分析/总结（不是编辑）？
    └── 使用 ctx_execute_file（文件载入 FILE_CONTENT，不进上下文）
```

## 各工具的适用场景

| 场景 | 工具 | 示例 |
|-----------|------|---------|
| 调用 API 端点 | ctx_execute | fetch('http://localhost:3000/api/orders') |
| 运行会返回数据的 CLI | ctx_execute | gh pr list、aws s3 ls、kubectl get pods |
| 运行测试 | ctx_execute | npm test、pytest、go test ./... |
| Git 操作 | ctx_execute | git log --oneline -50、git diff HEAD~5 |
| Docker/K8s 检查 | ctx_execute | docker stats --no-stream、kubectl describe pod |
| 读取日志文件 | ctx_execute_file | 解析 access.log、error.log、构建输出 |
| 读取数据文件 | ctx_execute_file | 分析 CSV、JSON、YAML、XML
| 读取源码以作分析 | ctx_execute_file | 统计函数、查找模式、提取指标 |
| 抓取网页文档 | ctx_fetch_and_index | 索引 React/Next.js/Zod 文档，然后搜索 |
| Playwright 快照 | browser_snapshot(filename) → ctx_index(path) → ctx_search | 保存到文件，服务端索引，再查询 |
| Playwright 快照（一次性） | browser_snapshot(filename) → ctx_execute_file(path) | 保存到文件，在沙箱中提取 |
| Playwright 控制台/网络 | browser_*(filename) → ctx_execute_file(path) | 保存到文件，在沙箱中分析 |
| MCP 输出（已在上下文中） | 直接使用 | 不要重新索引，它已加载 |
| MCP 输出（需多次查询） | 用 ctx_execute 保存 → ctx_index(path) → ctx_search | 先保存到文件，服务端索引 |
| 清空已索引的知识库内容 | ctx_purge(confirm: true) | 永久删除所有已索引内容 |

## 自动触发

以下任何情形都无需被要求，自动使用 context-mode：

- **API 调试**：调用这个端点、调用该 API、检查响应、找出响应中的 bug
- **日志分析**：查看日志、有哪些错误、读取 access.log、调试 500 错误
- **测试运行**：运行测试、检查测试是否通过、测试套件输出
- **Git 历史**：显示最近提交、git log、改了什么、分支间差异
- **数据查看**：看下 CSV、解析 JSON、分析配置
- **基础设施**：列举容器、检查 pod、S3 桶、显示运行中的服务
- **依赖审计**：检查依赖、过期的包、安全审计
- **构建输出**：构建项目、检查警告、编译错误
- **代码指标**：统计行数、查找 TODO、函数计数、分析代码库
- **网页文档查询**：查文档、查看 API 参考、找示例

## 语言选择

| 场景 | 语言 | 理由 |
|-----------|----------|-----|
| HTTP/API 调用、JSON | javascript | 原生 fetch、JSON.parse、async/await |
| 数据分析、CSV、统计 | python | csv、statistics、collections、re |
| 带管道的 shell 命令 | shell | grep、awk、jq 等原生工具 |
| 文件模式匹配 | shell | find、wc、sort、uniq |

## 搜索查询策略

- BM25 采用 OR 语义，匹配更多词的结果会自动排名更高
- 每次查询使用 2-4 个具体的技术术语
- 当索引了多个文档时，始终使用 source 参数，以避免跨源污染
  - 支持部分匹配：source: Node 可匹配 Node.js v22 CHANGELOG
- **始终使用 queries 数组** —— 在一次调用中批量放入所有搜索问题：
  - `ctx_search(queries: ["transform pipe", "refine superRefine", "coerce codec"], source: "Zod")`
  - 绝不多次单独调用 ctx_search()，把所有查询放进一个数组

## 外部文档

- 外部文档始终使用 ctx_fetch_and_index，对你不拥有的包，绝不用 cat 或带本地路径的 ctx_execute
- 对于托管在 GitHub 上的项目，使用原始 URL：https://raw.githubusercontent.com/org/repo/main/CHANGELOG.md
- 索引之后，在搜索中用 source 参数把结果范围限定到该特定文档

## 关键规则

1. 始终 console.log/print 你的发现。进入上下文的只有 stdout。没有输出就等于白跑一次调用。
2. 写分析代码，而不只是数据转储。不要 console.log(JSON.stringify(data))，先分析再打印发现。
3. 输出要具体。打印 bug 细节及其 ID、行号、确切数值，而不只是计数。
4. 对于你需要编辑的文件，使用普通的 Read 工具。context-mode 用于分析，而非编辑。
5. 仅对 Bash 白名单命令，文件修改、git 写操作、导航、进程控制、包安装和 echo 使用 Bash。其它一切都走 context-mode。
6. 绝不使用 ctx_index(content: large_data)。用 ctx_index(path: ...) 在服务端读取文件。content 参数会作为工具参数把数据送进上下文，仅用于少量内联文本。
7. 在 Playwright 工具（browser_snapshot、browser_console_messages、browser_network_requests）上始终使用 filename 参数。没有它，完整输出就会进入上下文。
8. 不要重新索引已在上下文中的数据。如果某个 MCP 工具在先前响应中返回了数据，它已加载，直接使用它或先保存到文件。

## 沙箱化数据工作流

<sandboxed_data_workflow>
  <critical_rule>
    使用支持保存到文件的工具时，始终使用 filename 参数。绝不把大量原始数据集直接返回到上下文。
  </critical_rule>
  <workflow>
    LargeDataTool(filename: "path") → mcp__context-mode__ctx_index(path: "path") → ctx_search()
  </workflow>
</sandboxed_data_workflow>

这是保存上下文的通用模式，无论来源工具是什么（Playwright、GitHub API、AWS CLI 等）。

## 示例

### 调试 API 端点
```javascript
const resp = await fetch('http://localhost:3000/api/orders');
const { orders } = await resp.json();

const bugs = [];
const negQty = orders.filter(o => o.quantity < 0);
if (negQty.length) bugs.push(`Negative qty: ${negQty.map(o => o.id).join(', ')}`);

const nullFields = orders.filter(o => !o.product || !o.customer);
if (nullFields.length) bugs.push(`Null fields: ${nullFields.map(o => o.id).join(', ')}`);

console.log(`${orders.length} orders, ${bugs.length} bugs found:`);
bugs.forEach(b => console.log(`- ${b}`));
```

### 分析测试输出
```shell
npm test 2>&1
echo "EXIT=$?"
```

### 查看 GitHub PR
```shell
gh pr list --json number,title,state,reviewDecision --jq '.[] | "\(.number) [\(.state)] \(.title) — \(.reviewDecision // "no review")"'
```

### 读取并分析大型文件
```python
# FILE_CONTENT 由 ctx_execute_file 预先载入
import json
data = json.loads(FILE_CONTENT)
print(f"Records: {len(data)}")
# ... 分析并打印发现
```

## 浏览器与 Playwright 集成

**当任务涉及 Playwright 快照、截图或页面检查时，始终走 file 到 sandbox 的路径。**

Playwright 的 browser_snapshot 会返回 10K 到 135K token 的可访问性树数据。不带 filename 调用它，会把这些数据全部倾倒进上下文。把输出传给 ctx_index(content: ...) 会作为参数把它第二次送进上下文。两者都是错的。

**关键洞见**：browser_snapshot 有一个 filename 参数，可保存到文件而非返回上下文。ctx_index 有一个 path 参数，可在服务端读取文件。ctx_execute_file 在沙箱中处理文件。这些都不触碰上下文。

### 工作流 A：快照 → 文件 → 索引 → 搜索（多次查询）

```
步骤 1：browser_snapshot(filename: "/tmp/playwright-snapshot.md")
        → 保存到文件，返回约 50B 的确认信息（不是 135K token）

步骤 2：ctx_index(path: "/tmp/playwright-snapshot.md", source: "Playwright snapshot")
        → 在服务端读取文件，索引进 FTS5，返回约 80B 的确认信息

步骤 3：ctx_search(queries: ["login form email password"], source: "Playwright")
        → 只返回匹配的片段（约 300B）
```

**上下文总量：约 430B**，而不是 270K token。实际节省 99%。

### 工作流 B：快照 → 文件 → 执行文件（一次性提取）

```
步骤 1：browser_snapshot(filename: "/tmp/playwright-snapshot.md")
        → 保存到文件，返回约 50B 的确认信息

步骤 2：ctx_execute_file(path: "/tmp/playwright-snapshot.md", language: "javascript", code: "
          const links = [...FILE_CONTENT.matchAll(/- link \"([^\"]+)\"/g)].map(m => m[1]);
          const buttons = [...FILE_CONTENT.matchAll(/- button \"([^\"]+)\"/g)].map(m => m[1]);
          const inputs = [...FILE_CONTENT.matchAll(/- textbox|- checkbox|- radio/g)];
          console.log('Links:', links.length, '| Buttons:', buttons.length, '| Inputs:', inputs.length);
          console.log('Navigation:', links.slice(0, 10).join(', '));
        ")
        → 在沙箱中处理，返回约 200B 的摘要
```

**上下文总量：约 250B**，而不是 135K token。

### 工作流 C：控制台与网络（数据量大时保存到文件）

```
browser_console_messages(level: "error", filename: "/tmp/console.md")
→ ctx_execute_file(path: "/tmp/console.md", ...) or ctx_index(path: "/tmp/console.md", ...)

browser_network_requests(includeStatic: false, filename: "/tmp/network.md")
→ ctx_execute_file(path: "/tmp/network.md", ...) or ctx_index(path: "/tmp/network.md", ...)
```

### 关键：为何 filename 加 path 是强制的

| 做法 | 上下文开销 | 正确吗？ |
|----------|-------------|----------|
| browser_snapshot() → 原始内容进上下文 | 135K token | 否 |
| browser_snapshot() → ctx_index(content: raw) | 270K token（翻倍） | 否 |
| browser_snapshot(filename) → ctx_index(path) → ctx_search | 约 430B | 是 |
| browser_snapshot(filename) → ctx_execute_file(path) | 约 250B | 是 |

### 关键规则

> **调用 browser_snapshot、browser_console_messages 或 browser_network_requests 时，始终使用 filename 参数。**
> 然后通过 ctx_index(path: ...) 或 ctx_execute_file(path: ...) 处理，绝不用 ctx_index(content: ...)。
>
> 数据流：Playwright → file → 服务端读取 → context。绝不要：Playwright → context → ctx_index(content) → 再次进入 context。

## 子代理用法

子代理通过 PreToolUse hook 自动接收 context-mode 工具路由。你无需手动把工具名添加进子代理提示，hook 会注入它们。只需写出自然的任务描述即可。

## 反模式

- 通过 Bash 用 curl http://api/endpoint，50KB 冲垮上下文。改用带 fetch 的 ctx_execute。
- 通过 Bash 用 cat large-file.json，整个文件进上下文。改用 ctx_execute_file。
- 通过 Bash 用 gh pr list，原始 JSON 进上下文。改用带 --jq 过滤的 ctx_execute。
- 把 Bash 输出通过 | head -20 管道截断，你丢失了其余部分。用 ctx_execute 分析全部数据并打印摘要。
- 在捕获之前收窄 ctx_execute 输出，ctx_execute 负责捕获、ctx_search 负责过滤；把这三层合并会丢弃索引从未看到的数据。见 references/anti-patterns.md 第 8 节。
- 通过 Bash 运行 npm test，完整测试输出进上下文。用 ctx_execute 捕获并总结。
- 调用 browser_snapshot() 时不带 filename 参数，135K token 冲垮上下文。始终使用 browser_snapshot(filename: "/tmp/snap.md")。
- 调用 browser_console_messages() 或 browser_network_requests() 时不带 filename，整个输出冲垮上下文。始终使用 filename 参数。
- 把任何大量数据传给 ctx_index(content: ...)，数据会作为参数进入上下文。始终用 ctx_index(path: ...) 在服务端读取。content 参数只应用于你自己编写的小段内联文本。
- 先调用某个 MCP 工具（Context7 query-docs、GitHub API 等），再把响应传给 ctx_index(content: response)，上下文占用翻倍。该响应已在上下文中，直接使用它或先保存到文件。
- 忽略 browser_navigate 的自动快照，导航响应包含完整页面快照。不要依赖它做检查，单独调用 browser_snapshot(filename)。
- 指望 ctx_stats 重置或清空任何东西，ctx_stats 是只读的（只显示统计信息）。用 ctx_purge(confirm: true) 永久删除所有已索引内容。

## 参考文件

- [JavaScript/TypeScript 模式](./references/patterns-javascript.md)
- [Python 模式](./references/patterns-python.md)
- [Shell 模式](./references/patterns-shell.md)
- [反模式与常见错误](./references/anti-patterns.md)
