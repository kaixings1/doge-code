---
name: 可观测性与仪器化
description: 可观测性与仪器化 — 为代码添加仪器化，使生产行为可见且易于诊断。
---

# 可观测性与仪器化

## 概述

无法观测的代码就是无法运维的代码。可观测性是从外部利用代码发出的遥测数据回答"系统在做什么以及为什么？"的能力。仪器化不是发布后的附加品——它与功能同时编写，就像测试一样。如果功能在没有遥测的情况下发布，第一个用户报告的错误就变成了考古调查而不是一次查询。

## 何时使用

- 构建任何将在生产环境中运行的功能
- 添加新服务、端点、后台作业或外部集成
- 生产事故诊断时间过长（"我们无法判断发生了什么"）
- 设置或审查告警规则
- 审查添加 I/O、重试、队列或跨服务调用的 PR

**不适用于：**
- 诊断正在发生的故障——使用 `debugging-and-error-recovery` 技能（可观测性是使该技能下一次快速诊断的关键）
- 性能分析和优化测量的缓慢——使用 `performance-optimization` 技能
- 上线日监控检查清单和回滚触发器——请参阅 `shipping-and-launch` 技能；本技能涵盖为它们提供数据的仪器化

## 流程

### 1. 在仪器化之前定义"正常工作"

没有问题的遥测就是噪音。在添加任何仪器化之前，写下值班工程师会针对该功能提出的 2-4 个问题：

```
FEATURE: checkout payment retry
QUESTIONS ON-CALL WILL ASK:
1. What fraction of payments succeed on first attempt vs after retry?
2. When a payment fails permanently, why? (provider error? timeout? validation?)
3. Is the payment provider slower than usual?
→ Every signal below must help answer one of these.
```

If you can't name the questions, you're not ready to instrument — you'll log everything and learn nothing.

### 2. Pick the right signal for each question

| Signal | Answers | Cost profile | Example |
|---|---|---|---|
| **Structured log** | "What happened in this specific case?" | Per-event; grows with traffic | `payment_failed` with provider error code |
| **Metric** | "How often / how fast, in aggregate?" | Fixed per series; cheap to 查询 | p99 latency of provider calls |
| **Trace** | "Where did time go across services?" | Per-请求; usually sampled | One slow checkout, broken down by hop |

Rule of thumb: metrics tell you **that** something is wrong, traces tell you **where**, logs tell you **why**.

### 3. Structured logging

Log events, not prose. Every log line is a JSON object with a stable event name and machine-readable fields:

```typescript
// BAD: string interpolation — unqueryable, inconsistent
logger.info(`Payment ${id} failed for user ${userId} after ${n} retries`);

// GOOD: stable event name + structured fields
logger.warn({
  event: 'payment_failed',
  paymentId: id,
  provider: 'stripe',
  errorCode: err.code,
  attempt: n,
}, 'payment failed');
```

**Log levels — use them consistently:**

| Level | Meaning | On-call action |
|---|---|---|
| `error` | Invariant broken; someone may need to act | Investigate |
| `warn` | Degraded but handled (retry succeeded, fallback used) | Watch for trends |
| `info` | Significant business event (order placed, job finished) | None |
| `debug` | Diagnostic detail | Off in production by default |

**Correlation IDs are mandatory.** Generate (or accept) a 请求 ID at the system boundary and attach it to every log line, span, and outbound call. Without it, you cannot reconstruct a single 请求 from interleaved logs:

```typescript
// Express: child logger per 请求, ID propagated downstream
app.use((req, res, next) => {
  req.id = req.headers['x-请求-id'] ?? crypto.randomUUID();
  req.log = logger.child({ requestId: req.id });
  res.setHeader('x-请求-id', req.id);
  next();
});
```

**绝不 log secrets, tokens, passwords, or full PII.** This is a hard rule from the `security-and-hardening` skill — telemetry pipelines are a classic data-leak path. Allowlist fields; don't log whole 请求 bodies.

### 4. Metrics

For 请求-driven services, instrument **RED** on every 端点 and every external dependency: **R**ate (requests/sec), **E**rrors (failure rate), **D**uration (latency histogram, not average). For resources (queues, pools, hosts), use **USE**: **U**tilization, **S**aturation, **E**rrors.

As with tracing, the vendor-neutral path is the OpenTelemetry metrics API (same SDK and context as step 5). The example below uses Prometheus' `prom-client` — one common backend choice, not the only one; the RED/USE and cardinality rules are identical either way.

```typescript
import { Histogram } from 'prom-client';

const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP 请求 duration',
  labelNames: ['method', 'route', 'status_class'],  // '2xx', not '200'
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});
```

**Cardinality is the failure mode.** Every unique label combination is a separate time series. Labels must come from small, fixed sets (route template, status class, provider name). 绝不 use user IDs, raw URLs, error messages, or other unbounded values as labels — that belongs in logs and traces.

```
OK as label:    route="/api/tasks/:id"   status_class="5xx"   provider="stripe"
NEVER a label:  user_id, email, request_id, full URL, error message text
```

Track averages never, percentiles always: an average hides the 1% of users having a terrible time. Use histograms and read p50/p95/p99.

### 5. Distributed tracing

Use OpenTelemetry — it's the vendor-neutral standard, and auto-instrumentation covers HTTP, gRPC, and common DB clients with near-zero code:

```typescript
// tracing.ts — must be imported before anything else
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: 'checkout-service',
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```

Add manual spans only around meaningful internal units of work (e.g., `applyDiscounts`, `chargeProvider`) and attach the attributes on-call will 过滤器 by. Propagate context across every async boundary — HTTP headers, queue message metadata — or the trace dies at the gap. Sample head-based at a low rate by default; keep 100% of errors if your backend supports tail sampling.

### 6. Alerting

Alert on **symptoms users feel**, not on causes:

```
SYMPTOM (page-worthy):           CAUSE (dashboard, not a page):
error rate > 1% for 5 min        CPU at 85%
p99 latency > 2s                 one pod restarted
queue age > 10 min               disk at 70%
```

Cause-based alerts fire when nothing is wrong and miss failures you didn't predict. Symptom-based alerts fire exactly when users are hurt, regardless of the cause.

Rules for every alert you create:

1. **It must be actionable.** If the 响应 is "ignore it, it self-heals", delete the alert.
2. **It links to a runbook** — even three lines: what it means, first 查询 to run, escalation path.
3. **It has a threshold and duration** justified by the SLO or by historical data, not by a guess.
4. Use two severities only: **page** (user-facing, act now) and **ticket** (degradation, act this week). A third tier becomes noise that trains people to ignore everything.

### 7. Verify the telemetry itself

Instrumentation is code; it can be wrong. Before calling the work done, trigger the paths and look at the actual output:

- Force an error in staging → find it in the logs by `requestId`, confirm fields are structured (not `[object Object]`)
- Send test traffic → confirm metric series appear with the expected labels and sane values
- Follow one 请求 across services in the tracing UI → no broken spans
- Fire each new alert once (lower the threshold temporarily) → confirm it reaches the right channel and the runbook link works

## 常见理由

| Rationalization | Reality |
|---|---|
| "I'll add logging after it works" | "After" becomes "after the first incident", which is the most expensive moment to discover you're blind. Instrument as you build. |
| "More logs = more observability" | Unstructured noise makes incidents slower, not faster. Three queryable events beat three hundred prose lines. |
| "console.log is fine for now" | Unstructured output can't be filtered, correlated, or alerted on. The structured logger costs five extra minutes once. |
| "We can just look at the dashboards when something breaks" | Dashboards built without defined questions show you everything except the answer. Start from on-call questions. |
| "Alert on everything important, we'll tune later" | A noisy pager trains people to ignore it. The tuning never happens; the missed real page does. |
| "User ID as a metric label makes debugging easier" | It also makes your metrics backend fall over. High-cardinality lookups belong in logs and traces. |
| "Tracing is overkill for our two services" | Two services already means cross-service latency questions logs can't answer. Auto-instrumentation makes the cost trivial. |

## 危险信号

- A feature PR with retries, queues, or external calls and zero new telemetry
- Log lines built by string interpolation instead of structured fields
- No correlation/请求 ID — each log line is an orphan
- Metrics labeled with user IDs, raw URLs, or error message text (cardinality bomb)
- Latency tracked as an average with no percentiles
- Alerts that fire daily and get acknowledged without action
- Alerts on causes (CPU, memory) paging humans while user-facing error rate is unmonitored
- Secrets, tokens, or full 请求 bodies appearing in logs
- "It works on my machine" as the only evidence a production feature is healthy

## 验证

After instrumenting a feature, confirm:

- [ ] The on-call questions for this feature are written down, and each signal maps to one
- [ ] All log output is structured (JSON), with stable event names and a correlation ID on every line
- [ ] No secrets, tokens, or unredacted PII in any log line (spot-check actual output)
- [ ] RED metrics exist for every new 端点 and every external dependency, with bounded label sets
- [ ] Latency is a histogram; p95/p99 are queryable
- [ ] A single 请求 can be followed end-to-end in the tracing UI without broken spans
- [ ] Every new alert is symptom-based, has a runbook link, and was test-fired once
- [ ] An induced failure in staging was located via telemetry alone, without reading the source

For the at-a-glance version of this list, including the pre-launch instrumentation gate, see `references/observability-checklist.md`.
