---
name: log-driven-debug
description: 日志驱动闭环调试法（Log-Driven Closed-Loop Debugging, LDCLD）。把日志从"事后排查工具"升级为"事前验收标准"，用"注释先行 → 插桩 → 最小执行 → 抓日志 → 断言 → 修正"的闭环，一次只改一个变量，直到程序行为与预期完全一致。
triggers:
  - 程序行为与预期不符且不能一眼看出原因
  - 需要修改他人代码 / 遗留代码 / 无文档代码
  - 网络程序出现超时、粘包、断连、错序、丢包
  - 有日志但"看不出走到哪一步"
  - 修一个 bug 冒出两个新 bug（未闭环）
---

# 技能：日志驱动闭环调试法（LDCLD）

> **把日志从"事后排查工具"升级为"事前验收标准"。**
> 闭环：注释先行 → 插桩 → 最小执行 → 抓日志 → 断言 → 修正，一次只改一个变量。

---

## 0. 触发条件

在以下任一情况下**必须**启用本技能：

- 程序行为与预期不符，且不能一眼看出原因
- 需要修改他人代码 / 遗留代码 / 无文档代码
- 网络程序（TCP/UDP/HTTP/WebSocket/RPC）出现超时、粘包、断连、错序、丢包
- 有日志输出，但日志"看不出走到哪一步"
- 修了一个 bug，冒出两个新 bug（说明未闭环）

---

## 1. 七条铁律（违反任意一条即视为调试失败）

| # | 铁律 | 含义 |
|---|------|------|
| 1 | **无注释不改代码** | 改任何一行前，先用注释写清"这段代码应该做什么、输入什么、输出什么、走哪个分支" |
| 2 | **无插桩不执行** | 任何一次执行前，必须在关键路径上埋日志；无日志的执行 = 无效执行 |
| 3 | **无预期不跑测** | 跑之前先写下"我期望看到哪些日志行、什么顺序、什么值"；否则无法判定对错 |
| 4 | **一次只改一个变量** | 一次修改只动一处逻辑；多处同改 = 无法归因 |
| 5 | **最小执行单元** | 不跑整个程序验证一个函数；用 harness 把目标函数单独拉出来跑 |
| 6 | **遇到问题就解决，不绕过** | 依赖不通就造 stub，环境不对就 mock，绝不"先跳过这段" |
| 7 | **日志即证据，闭环才算完** | 修复的验收标准是"日志断言全绿"，不是"看起来对了" |

---

## 2. 工作流总览

```
┌─────────────────────────────────────────────────────────────┐
│  P0 侦察 → P1 意图注释 → P2 插桩 → P3 最小执行单元           │
│      ↑                                        ↓              │
│  P6 定位修复 ← P5 断言判定 ← P4 执行采集日志                 │
│      ↓                                                       │
│  P7 回归 + 清场（去掉临时插桩，保留结构化日志）              │
└─────────────────────────────────────────────────────────────┘
         ↑___________________ 不满足预期则回到 P1 ________________│
```

**闭环判据**：P5 的日志断言 **全部通过** → 进入 P7；否则 → 回到 P1/P2（加更细的注释与插桩），**不是**直接改代码。

---

## 3. 阶段详解

### P0 · 侦察（Reconnaissance）

目标：搞清"这个函数/功能从哪进、到哪出、依赖谁"。

动作：
1. 画出**调用链**：入口 → 中间件 → 目标函数 → 外部依赖（socket/文件/DB/API）
2. 标出**所有分支点**（if/except/continue/return）
3. 标出**所有 I/O 边界**（send/recv/read/write/connect/accept）
4. 列出**未知量**（哪些变量的值在运行时才知道）

产出：一张文本调用图 + 未知量清单。

```text
[入口] main()
   └─> client.connect(host, port)  ← 未知量: host/port 是否正确解析
        └─> sock.sendall(payload)  ← 未知量: payload 长度/编码
             └─> recv_loop()       ← 未知量: 分包边界
                  └─> parse(resp)  ← 未知量: 协议格式假设
```

### P1 · 意图注释（Intent Annotation）

**在动代码之前**，为每个待验证函数写"意图块注释"。这是本技能的核心——注释先行，代码后修。

```python
def recv_message(sock, timeout=5):
    # ── INTENT ────────────────────────────────────────────────
    # 目的 : 从 socket 完整读取一条消息（协议: 4字节大端长度 + body）
    # 输入 : sock(已连接), timeout(秒)
    # 输出 : bytes 完整消息体；None 表示对端正常关闭
    # 抛出 : TimeoutError / ConnectionResetError
    # 分支 :
    #   B1 len(header) < 4 且超时     → raise TimeoutError
    #   B2 header == b''              → return None (对端关闭)
    #   B3 body 未读满                → 继续 recv 直到读满
    #   B4 收到长度 > MAX_LEN         → raise ProtocolError（防内存爆炸）
    # 预期日志 :
    #   L1 "recv.header raw=<hex> len=<n>"
    #   L2 "recv.body need=<n> got=<m>"
    #   L3 "recv.done total=<n>"
    # ──────────────────────────────────────────────────────────
    ...
```

> 写不出这段注释 = 你还没理解这段代码 = 不该改它。先去读懂，再回来。

### P2 · 插桩（Instrumentation）

在 P1 标出的**每个分支入口 + 每个 I/O 边界 + 每个状态变更点**打日志。

**插桩规范：**

| 维度 | 要求 |
|------|------|
| 格式 | `[TAG] key=value key=value` —— 结构化，易 grep，易断言 |
| TAG | 用 `模块.动作`，如 `recv.header`、`conn.retry`、`parse.fail` |
| 时机 | 进入分支前打（含判定条件值）、离开分支后打（含结果值） |
| 内容 | 必含：**判定依据**（条件表达式实际值）+ **结果**（走向哪条分支） |
| 值 | 二进制打 hex 前 32 字节 + 长度；字符串截断到 200 字符；对象打 id/repr |
| 级别 | `DEBUG` 细节 / `INFO` 状态流转 / `WARN` 异常但可恢复 / `ERROR` 失败 |
| 唯一性 | 每行日志能唯一定位到源码行（建议带 `where=` 或行号） |

```python
import logging, binascii
log = logging.getLogger("net")

def recv_message(sock, timeout=5):
    sock.settimeout(timeout)

    # ── B2: 对端关闭? ──
    header = _recv_exact(sock, 4)
    log.debug(f"[recv.header] raw={binascii.hexlify(header).decode()} len={len(header)}")
    if header == b"":
        log.info("[recv.closed] peer_closed=True → return None")   # B2
        return None

    # ── B4: 长度合法性? ──
    need = int.from_bytes(header, "big")
    log.debug(f"[recv.len] need={need} max={MAX_LEN}")
    if need > MAX_LEN:
        log.error(f"[recv.protocol_error] need={need} > max={MAX_LEN}")  # B4
        raise ProtocolError(f"frame too large: {need}")

    # ── B3: 读满 body ──
    body = _recv_exact(sock, need)
    log.info(f"[recv.done] need={need} got={len(body)}")               # B3
    return body
```

**网络程序额外插桩点（必打）：**
- `connect` 前：目标地址、解析后的 IP、是否走了代理
- `send` 前后：实际写入字节数（`send` 不保证全写！）
- `recv` 每次返回：本次字节数 + 累计字节数 + 是否 `EAGAIN/EWOULDBLOCK`
- 超时/重连：第几次重试、退避时长、上次错误码
- 关闭：`FIN`/`RST` 方向、谁先关、`SO_ERROR` 值

### P3 · 最小执行单元（Harness）

**绝不**为了验证 `recv_message` 而启动整个服务端 + 客户端 + 数据库。

构造 harness：把目标函数所需的**最小依赖**喂给它。

```python
# harness_recv.py —— 只测 recv_message，不碰真实网络
import socket, threading, time, logging, sys

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    stream=sys.stdout,
)

def make_fake_peer(chunks, delay=0.05):
    """起一个本地 socketpair，按 chunks 分片发送（模拟粘包/半包）"""
    a, b = socket.socketpair()
    def feeder():
        for c in chunks:
            b.sendall(c)
            time.sleep(delay)
        b.close()
    threading.Thread(target=feeder, daemon=True).start()
    return a

def case_half_packet():
    """场景: header 与 body 分两次到达（半包）"""
    body = b"hello"
    frame = len(body).to_bytes(4, "big") + body
    sock = make_fake_peer([frame[:2], frame[2:]])   # 故意切碎
    got = recv_message(sock)
    assert got == body, f"expect {body!r} got {got!r}"
    print("CASE half_packet: PASS")

if __name__ == "__main__":
    for case in [case_half_packet, case_peer_close, case_oversize, ...]:
        print(f"--- RUN {case.__name__} ---")
        case()
```

**Harness 设计要点：**
- 每个 case 只验证**一个**行为（对应 P1 注释里的一个分支）
- case 名字 = 分支名（`case_half_packet` ↔ B3）
- 用 `socketpair` / `mock` / `fakeredis` 替代真实依赖 —— 快、可重复
- 每个 case 单独可跑：`python harness_recv.py case_half_packet`
- 依赖缺失时**造 stub**，不跳过（铁律 6）

### P4 · 执行与采集

```bash
# 单 case 执行 + 日志落盘（可追溯、可 diff）
python harness_recv.py case_half_packet 2>&1 | tee logs/case_half_packet.log

# 只抓关键 TAG
python harness_recv.py case_half_packet 2>&1 | grep -E '\[recv\.|\[conn\.'
```

**采集纪律：**
- 每次执行产出**独立日志文件**，命名含 case + 时间戳
- 保留原始输出，不手动编辑日志
- 失败 case 的日志**原样保留**，作为回归依据

### P5 · 断言与判定（核心判定表）

把 P1 注释里的"预期日志"变成**可执行的断言**。

| 断言类型 | 写法 | 用途 |
|---------|------|------|
| 存在性 | 日志中出现 `[recv.done]` | 走到了这条分支 |
| 顺序性 | `[recv.header]` 在 `[recv.body]` 之前 | 控制流正确 |
| 数值 | `need=5 got=5` | 数据正确 |
| 计数 | `[conn.retry]` 恰好出现 3 次 | 重试逻辑正确 |
| 缺失 | 不应出现 `[recv.protocol_error]` | 未误入错误分支 |
| 时序 | 两条日志时间差 < 50ms | 无意外阻塞 |

**判定表模板（每个 case 一张）：**

```text
CASE: half_packet
预期日志序列:
  1. [recv.header] len=4
  2. [recv.len]    need=5
  3. [recv.done]   need=5 got=5
预期结果: return b"hello"
实际日志:
  1. [recv.header] len=4
  2. [recv.len]    need=5
  3. [recv.done]   need=5 got=2      ← ❌ 不符 (got=2)
判定: FAIL —— 走到 B3 但 _recv_exact 未循环读满
下一步: 回到 P1，为 _recv_exact 补意图注释与插桩
```

> **关键**：判定"不符"时，**先看日志差在哪一行**，那就是要下钻的位置。不要凭直觉改。

### P6 · 定位与修复

**定位四步法：**

1. **对齐**：把"预期日志序列"与"实际日志序列"逐行对齐，第一个不同的地方 = 下钻点
2. **下钻**：对下钻点所在函数，回到 P1 重写意图注释，回到 P2 加更细粒度插桩
3. **二分**：若分支多，用日志开关二分——先只保留前半段插桩，确认前半段对，再查后半段
4. **修复**：定位到具体行后，**只改这一处**（铁律 4），改完立刻重跑 P3-P5

**修复时的注释纪律：**
```python
# FIX(2024-xx-xx): _recv_exact 之前只 recv 一次，半包时提前返回
#   依据: logs/case_half_packet.log 显示 got=2 need=5
#   改法: 循环读取直到 len(buf)==n 或对端关闭
#   REVERT: git revert <hash> 若引入死循环
def _recv_exact(sock, n):
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        log.debug(f"[recv.chunk] want={n-len(buf)} got={len(chunk)} total={len(buf)}")
        if not chunk:
            raise ConnectionResetError(f"peer closed, have {len(buf)}/{n}")
        buf += chunk
    return bytes(buf)
```

### P7 · 回归与清场

1. **回归**：跑**全部** case（不只修的那个），确认无退化
2. **清场**：删掉临时性 `D�EBUG` 插桩；**保留**结构化状态日志（`INFO` 级）
3. **固化**：把 harness 的 case 转成正式单测（pytest/unittest）
4. **归档**：`logs/` 下保留修复前后的日志对，作为证据

---

## 4. 网络程序专项：常见失败 → 对策

| 现象 | 日志应打什么 | 常见根因 | 对策 |
|------|------------|---------|------|
| 读不到数据 | recv 返回值、errno、超时 | 半包 / 阻塞未超时 | 循环读满 + settimeout |
| 粘包 | 每次 recv 的字节数 | 按"一次 recv = 一条消息"假设 | 加长度前缀/分隔符，循环解帧 |
| send 丢数据 | sendall 前长度、send 返回值 | 用了 `send` 非 `sendall` | 换 `sendall` 或循环 send |
| 连接随机失败 | 解析 IP、connect errno、重试次数 | DNS/代理/端口耗尽 | 打 `getaddrinfo` 结果 + `SO_ERROR` |
| 卡死不返回 | 进入/离开每个阻塞点的日志 | 死锁 / 无超时 | 所有阻塞调用加超时 + 打点 |
| 数据错乱 | 收发 hex 前 32 字节 | 编码 / 字节序 / 缓冲区复用 | 固定字节序 + 打印 hex 对比 |
| 重连风暴 | 每次重试的时间戳与退避值 | 无退避 / 立即重连 | 指数退避 + 打退避日志 |

---

## 5. 自指令协议（Agent 内部循环）

每次迭代严格按以下 8 问自检：

```
1. 我现在要验证的是哪个函数/哪条分支？        → 单一目标
2. 它的意图注释写了吗？预期日志列了吗？        → P1 完成?
3. 每个分支入口/出口/I-O 边界都插桩了吗？     → P2 完成?
4. 有没有最小 harness？能单独跑吗？            → P3 完成?
5. 我跑了吗？日志落盘了吗？                    → P4 完成?
6. 预期 vs 实际，第一处不符在哪一行？          → P5 判定
7. 这一处对应的源码行是哪行？我改动了几处？    → P6（只许一处）
8. 全量 case 都过了吗？临时插桩清了吗？        → P7 闭环
```

**任一问答"否" → 不进入下一步。**

---

## 6. 终止条件（何时停）

满足**全部**下列条件才算完成：

- [ ] 目标功能的所有 case 日志断言通过
- [ ] 修复点有 FIX 注释（含依据日志路径）
- [ ] 临时 DEBUG 插桩已清理，结构化日志保留
- [ ] 全量回归无退化
- [ ] 失败日志与成功日志成对归档

**不允许**的终止：`"看起来好了"` / `"应该没问题了"` / `"先这样吧"`。

---

## 7. 反模式（见到即纠正）

| 反模式 | 为什么错 | 正确做法 |
|-------|---------|---------|
| 一次性改 5 个地方 | 无法归因 | 一次一处，�个验证 |
| 跑整个程序验证小函数 | 慢、噪声大 | 建 harness |
| 日志打 `print("here")` | 无值无分支，无法断言 | `[tag] key=value` 结构化 |
| 先改代码后补注释 | 注释沦为事后描述 | 注释先行（P1） |
| 遇到坏依赖就注释掉 | 掩盖问题 | 造 stub/mock |
| 靠 `try/except: pass` 压错误 | 错误变静默 | 打错误日志 + 定位 |
| 只看最终结果不看日志顺序 | 漏掉中间分支错误 | 断言日志序列 |
| 修复后不回归 | 引入新 bug | 跑全量 case |

---

## 8. 交付物清单

一次完整的 LDCLD 迭代应产出：

```
logs/
  case_half_packet.20240101_120000.log      # 失败日志（修复前）
  case_half_packet.20240101_120500.log      # 成功日志（修复后）
harness/
  harness_recv.py                            # 最小执行单元
tests/
  test_recv.py                               # 固化后的正式单测
CHANGELOG.debug.md                           # 每轮迭代：目标/预期/实际/修复/证据
```

`CHANGELOG.debug.md` 单条格式：

```markdown
## 2024-01-01 12:00 · recv_message 半包问题
- 目标分支: B3 (body 未读满 → 继续 recv)
- 预期日志: [recv.done] need=5 got=5
- 实际日志: [recv.done] need=5 got=2   (logs/case_half_packet.*.log)
- 根因: _recv_exact 只 recv 一次
- 修复: 循环读取 (commit abc123)
- 验证: 4/4 case PASS (logs/regression.*.log)
```

---

## 9. 一句话记忆

> **先注释、再插桩、单独跑、抓日志、对预期、只改一处、全量回归、清场归档。**
> **日志不是用来看的，是用来当验收标准的。**
