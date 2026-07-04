---
name: growth-engine
description: "面向数字产品的增长引擎——增长黑客、SEO、ASO、病毒循环、电子邮件营销、CRM、推荐计划和有机获取。"
risk: none
source: community
date_added: '2026-03-06'
author: renat
tags:
- growth
- seo
- marketing
- viral
- acquisition
tools:
- claude-code
- antigravity
- cursor
- gemini-cli
- codex-cli
---

# 增长引擎 -- 指数级增长

## 概述

数字产品的增长引擎——增长黑客、SEO、ASO、病毒循环、电子邮件营销、CRM、推荐计划与有机获客。适用于：制定增长策略、技术 SEO、应用商店 ASO、推荐计划、电子邮件营销、病毒系数、获客漏斗、有机增长内容、发布活动。

## 何时使用本技能

- 当您需要此领域的专业协助时

## 何时不使用本技能

- 任务与增长引擎无关时
- 更简单、更具体的工具可以处理请求时
- 用户需要没有领域专长的通用帮助时

## 工作原理

> 最好的营销是让人热爱的产品。—— Sam Altman
> 真正的增长始于值得推荐的产品。

---

## 海盗指标 (AARRR) 用于 Auri

获客：人们如何发现 Auri？
                目标：10,000 访客/月 -> 1,000 注册
                渠道：SEO、Product Hunt、科技博主、PR

    激活：用户何时体验第一个价值？
                目标：60% 在 24 小时内完成首次对话
                指标：首次对话率 (FCR)

    留存：人们会回来吗？
                目标：D7 = 30%, D30 = 15%, D90 = 8%
                指标：WAC（周活跃对话用户）

    收入：人们付费吗？
                目标：8% 试用 -> Pro 转换率
                指标：MRR、ARPU、LTV

    推荐：人们会推荐吗？
                目标：NPS > 50, 病毒系数 > 0.3
                指标：每用户推荐数、K 因子

---

## Auri 落地页 SEO 检查清单

<title>Auri -- O Assistente de Voz que Realmente Pensa | para Alexa</title>
    <meta name="description" content="Auri transforma seu Alexa em um assistente
    com Claude AI. Analise de negocios, decisoes estrategicas e memoria real.">

    <meta property="og:title" content="Auri -- IA de Voz para Alexa">
    <meta property="og:description" content="O primeiro assistente de voz
    com raciocinio real. Powered by Claude.">

    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "Auri",
      "operatingSystem": "Amazon Alexa",
      "applicationCategory": "AI Assistant",
      "offers": {"@type": "Offer", "price": "0"},
      "aggregateRating": {"@type": "AggregateRating",
                             "ratingValue": "4.8", "ratingCount": "127"}
    }
    </script>

## Auri 战略关键词

高意向（转化）：
    - "skill alexa inteligente"
    - "assistente alexa com ia"
    - "como usar claude no alexa"

    信息型（教育）：
    - "assistente de voz ia brasil"
    - "melhor skill alexa portugues"

    长尾（低竞争）：
    - "alexa responder perguntas complexas"
    - "skill alexa analise de negocios"

---

## Amazon Skill 商店优化

skill_name: "Auri -- IA de Voz Inteligente"
    invocation: "auri"

    short_description: >
      Auri transforma seu Alexa em um assistente verdadeiramente inteligente.
      Powered by Claude AI -- pensa, recorda e evolui com voce.

    long_description: >
      Chega de respostas rasas. Auri e o primeiro assistente de voz com
      raciocinio real para o mercado brasileiro.

      O QUE A AURI FAZ:
      - Analisa problemas de negocio complexos
      - Recorda conversas anteriores (memoria real)
      - Oferece perspectivas de expertos
      - Aprende suas preferencias ao longo do tempo

      COMO COMECAR: Diga "Alexa, abrir Auri" e comece a conversar naturalmente.

    example_phrases:
      - "Alexa, abrir Auri"
      - "Me ajuda a decidir entre essas duas opcoes de negocio"
      - "Analisa esse problema para mim"

    keywords: "ia, inteligencia artificial, assistente inteligente, claude, negocios"

---

## Auri 病毒循环类型

循环 1：有机口碑
    触发：用户与 Auri 进行了令人印象深刻的对话
    行为：与朋友/社交媒体分享
    目标：每个用户带来 0.3 个新用户 (K=0.3)

    循环 2：洞察分享
    触发：Auri 生成了特别好的洞察
    行为："分享此洞察"按钮 -> 生成社交媒体帖子
    目标：5% 的对话产生一次分享

    循环 3：推荐计划
    激励：每邀请一位朋友订阅 Pro，获得 1 个月 Pro
    目标：10% 的 Pro 用户至少推荐 1 人

## 病毒系数计算器

def calculate_k_factor(percent_who_invite, invites_per_user, conversion_rate):
        k = percent_who_invite * invites_per_user * conversion_rate
        if k >= 1:
            status = "病毒式增长（每个用户带来超过 1 个）"
        elif k >= 0.5:
            status = "良好（加速增长）"
        elif k >= 0.2:
            status = "尚可（支撑增长）"
        else:
            status = "较低（增长缓慢）"
        return {"k_factor": round(k, 2), "status": status,
                "interpretation": f"每 100 个用户带来 {int(k*100)} 个新用户"}

---

## 引导序列（7 天）

第 0 天 -- 欢迎（注册后立即发送）
    主题："欢迎使用 Auri。这是如何开始的。"
    正文：3 步教程、首次对话链接、使用提示

    第 1 天 -- 激活（如果未进行首次对话）
    主题："您的 Auri 正在等您"
    正文：3 种最令人印象深刻的提问类型、紧急 CTA

    第 3 天 -- 教育
    主题："本周 100 名 Auri 用户发现了什么"
    正文：真实案例 + 令人惊讶的洞察 + 隐藏功能

    第 7 天 -- 追加销售（如果至少使用 3 次）
    主题："您已使用免费额度的 80%"
    正文：Pro 解锁内容、48 小时特惠、社交证明

    第 14 天 -- 重新激活（如果停止使用）
    主题："想念您，[名称]。发生了什么？"
    正文：真诚提问、便捷返回链接、新功能

---

## 发布策略

提前 1 周：
    - 邀请有影响力的猎手来推荐产品
    - 准备素材：Logo、标语、截图、60 秒演示视频
    - 预热：在 X/LinkedIn 上发布关于 Auri 解决问题的帖子
    - 招募 50 名早期用户在产品发布时点赞

    发布日（太平洋时间午夜）：
    - 在 X 发帖：精彩演示 + Product Hunt 链接
    - 向所有等待列表发送邮件："今天我们上了 Product Hunt！"
    - 在巴西技术社区的 Telegram/Discord 发送消息
    - 全天在线回复评论

    定位：标语："真正会思考的 Alexa 技能"

---

## 7. 命令

| 命令 | 操作 |
|---------|------|
| /growth-audit | 完整的增长审计 |
| /seo-analysis | 落地页 SEO 分析 |
| /aso-optimize | 优化 Alexa 技能元数据 |
| /viral-loop | 为产品设计病毒循环 |
| /email-sequence | 创建电子邮件营销序列 |
| /launch-plan | 完整的发布计划 |
| /referral-program | 设计推荐计划 |

## 最佳实践

- 提供关于您的项目和需求的清晰、具体的上下文
- 在将建议应用于生产代码之前审查所有建议
- 与其他互补技能结合以实现全面分析

## 常见陷阱

- 将本技能用于其领域专长之外的任务
- 在不理解您的具体上下文的情况下应用建议
- 未提供足够的项目上下文以进行准确分析

## 相关技能

- `analytics-product` - 用于增强分析的互补技能
- `monetization` - 用于增强分析的互补技能
- `product-design` - 用于增强分析的互补技能
- `product-inventor` - 用于增强分析的互补技能

## 局限性
- 仅当任务明确匹配上述范围时使用本技能。
- 不要将输出视为环境特定验证、测试或专家评审的替代品。
- 如果缺少所需的输入、权限、安全边界或成功标准，请停下来寻求澄清。
