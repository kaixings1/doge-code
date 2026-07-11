---
name: 研讨会营销
description: "/cs:webinar — 网络研讨会&虚拟活动营销工作流。从零规划研讨会（按业务目标倒推规模）、拯救效果不佳的活动（评分漏斗、修复瓶颈阶段）、或将过去的研讨会转化为 evergreen 点播线索引擎。涵盖完整漏斗：注册、推广预热、出席、现场互动、直播成交、细分跟进。将研讨会视为漏斗而非活动。"
---

# /cs:webinar — 网络研讨会与虚拟活动营销

**命令：** `/cs:webinar [mode] [args]`

`cs-webinar` 命令是**网络研讨会工作流的入口点**：规划 → 推广 → 运行 → 跟进，或诊断 → 修复 → 重新运行。

## 何时运行

- 从零规划网络研讨会、虚拟活动、现场演示、工作坊、大师课、炉边谈话或虚拟峰会
- 拯救数据令人失望的网络研讨会——注册率低、出席率低或与会者不转化
- 将一次性的网络研讨会转变为始终在线的常青/点播引擎
- 评分现有漏斗以找出实际出问题的阶段

## 何时不运行

- 完整产品发布（不仅仅是网络研讨会）→ 使用 `/cs:launch` / launch-strategy
- 与活动无关的通用生命周期培育邮件 → 使用 `emails` 技能
- 线下现场活动物流（场地、餐饮、展位）→ 超出范围

## 模式

### `plan` — 从头设计整个流程

```bash
/cs:webinar plan
```

遍历信息收集、锁定承诺和格式、从业务目标向后推算漏斗规模、构建推广跑道，并设计出席 + 现场转化 + 跟进。使用 `marketing-skill/skills/webinar-marketing/templates/webinar-plan-template.md` 交付完整计划。

### `rescue` — 诊断和修复表现不佳的网络研讨会

```bash
/cs:webinar rescue --input funnel.json
```

评分漏斗、指出最弱的阶段，并返回针对实际瓶颈的排名修复方案——而非反射性地重写落地页。

### `evergreen` — 将过去的网络研讨会转换为点播

```bash
/cs:webinar evergreen
```

映射点播注册 → 观看 → 跟进自动化，附带诚实的现场 vs 模拟框架。

### `score` — 直接运行漏斗评分器

```bash
/cs:webinar score --input funnel.json
/cs:webinar score                 # 嵌入式示例数据
```

## 最低信息收集（3 个问题）

| 问题 | 询问内容 | 何时 |
|---|---|---|
| Q1 | 哪个模式 — plan / rescue / evergreen？ | 始终 |
| Q2 | 业务目标 + 转化操作（潜在客户、管道、采用、留存、品牌）？ | 始终（驱动向后漏斗计算） |
| Q3 | 受众温度（客户 / 温 / 自有冷 / 付费冷）？ | 始终（选择基准） |

如果存在，先读取 `marketing-context.md`——它涵盖品牌语态、人物画像和客户语言，所以你只询问特定于本次活动的内容。

## 工作流

```bash
# 模式：rescue / score — 首先找出问题阶段
python3 marketing-skill/skills/webinar-marketing/scripts/webinar_funnel_scorer.py funnel.json
# → 总体 0-100 评分 + 各阶段率 vs 基准 + 命名瓶颈

# 通过标准输入传递 JSON
cat funnel.json | python3 marketing-skill/skills/webinar-marketing/scripts/webinar_funnel_scorer.py -

# 使用嵌入式示例数据演示（无 --help 标志——无参数运行）
python3 marketing-skill/skills/webinar-marketing/scripts/webinar_funnel_scorer.py
```

输入 JSON（`registrations` + `attended_live` 必需；其余可选）：

```json
{
  "invited": 5000, "page_visits": 1800, "registrations": 620,
  "attended_live": 180, "cta_clicks": 40, "conversions": 14,
  "audience": "owned_cold", "runtime_min": 45, "avg_watch_min": 26
}
```

## 漏斗计算（向后规划）

始终从业务目标向后推算——这可以防止有人在只有 6 人购买时庆祝 800 人注册：

```
业务目标：         20 个销售合格机会
÷ 出席者→SQO 率   (~10%)      → 需要 200 个参与出席者
÷ 注册→出席       (~35% 现场) → 需要约 570 次注册
÷ 落地页 CVR       (~40%)     → 需要约 1,425 次落地页访问
→ 推广必须驱动约 1,425 次合格访问
```

如果所需访问量超过可触达的受众，请立即调整目标、格式或推广预算。

## 受众基准

评分器按受众温度校准（温度越高的受众在每个阶段的转化越好）：

| 受众 | 页面→注册 | 注册→出席 | 出席→CTA | 出席→转化 |
|---|---|---|---|---|
| `customers` | 40% | 50% | 25% | 12% |
| `warm` | 35% | 42% | 22% | 10% |
| `owned_cold` | 25% | 35% | 18% | 7% |
| `paid_cold` | 18% | 28% | 15% | 5% |

## 被拒绝的反模式

- 庆祝注册而出席率或转化率悄然失败
- 当问题阶段是出席率或现场转化时重写落地页
- 在从业务目标向后推算漏斗规模前推广
- 明显虚假的现场框架侵蚀受众信任
- 将网络研讨会视为活动而非漏斗

## 触发短语

- "规划网络研讨会" / "网络研讨会策略"
- "我的网络研讨会不转化" / "出席率低"
- "网络研讨会推广" / "网络研讨会跟进"
- "虚拟活动" / "现场演示" / "大师课" / "炉边谈话" / "虚拟峰会"
- "常青网络研讨会" / "点播网络研讨会"
- "注册漏斗" / "出席率"

## 相关

- 智能体：`cs-webinar-marketer`
- 技能：`webinar-marketing`
- 配套：`/cs:aeo`（通过 AI 搜索引用支持内容）、launch-strategy（完整发布）

---

**Version:** 2.9.0
**License:** MIT
