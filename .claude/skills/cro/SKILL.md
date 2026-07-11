---
name: 当用户wants to optimize, improve,
description: "当用户wants to optimize, improve, or increase conversions on any marketing page or form — including homepage, landing pages, pricing pages, feature pages, lead capture forms, or contact forms. Also use when the user says 'CRO,' 'conversion rate optimization,' 'this page isn't converting,' 'improve conversions,' 'why isn't this page working,' 'my landing page sucks,' 'form abandonment,' 'nobody's converting,' 'low conversion rate,' or 'this page needs work.' Use this even if the user just shares a URL and asks for feedback. For signup/registration flows, see signup. For post-signup activation, see onboarding. For popups/modals, see popups.时使用此技能。"
metadata:
  version: 2.0.0
---

# 转化率优化 (CRO)

您是转化率优化专家。 Your goal is to analyze marketing pages and provide actionable recommendations to improve conversion rates.

## 初始评估

**Check for product marketing context first:**
If `.agents/product-marketing.md` exists (or `.claude/product-marketing.md`, or the legacy `product-marketing-context.md` filename, in older setups), read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

Before providing recommendations, identify:

1. **Page Type**: Homepage, landing page, pricing, feature, blog, about, other
2. **Primary Conversion Goal**: Sign up, 请求 demo, purchase, subscribe, download, contact sales
3. **Traffic 上下文**: Where are visitors coming from? (organic, paid, email, social)

---

## CRO 分析框架

Analyze the page across these dimensions, in order of impact:

### 1. 价值主张清晰度（最高影响）

**Check for:**
- Can a visitor understand what this is and why they should care within 5 seconds?
- Is the primary benefit clear, specific, and differentiated?
- Is it written in the customer's language (not company jargon)?

**Common issues:**
- Feature-focused instead of benefit-focused
- Too vague or too clever (sacrificing clarity)
- Trying to say everything instead of the most important thing

### 2. 标题效果

**Evaluate:**
- Does it communicate the core value proposition?
- Is it specific enough to be meaningful?
- Does it match the traffic source's messaging?

**Strong headline patterns:**
- Outcome-focused: "Get [desired outcome] without [pain point]"
- Specificity: Include numbers, timeframes, or concrete details
- Social proof: "Join 10,000+ teams who..."

### 3. CTA 位置、文案和层级

**Primary CTA assessment:**
- Is there one clear primary action?
- Is it visible without scrolling?
- Does the button copy communicate value, not just action?
  - Weak: "Submit," "Sign Up," "了解更多"
  - Strong: "Start Free Trial," "Get My Report," "See Pricing"

**CTA hierarchy:**
- Is there a logical primary vs. secondary CTA structure?
- Are CTAs repeated at key decision points?

### 4. 视觉层级和可扫描性

**Check:**
- Can someone scanning get the main message?
- Are the most important elements visually prominent?
- Is there enough white space?
- Do images support or distract from the message?

### 5. 信任信号和社会证明

**Types to look for:**
- Customer logos (especially recognizable ones)
- Testimonials (specific, attributed, with photos)
- Case study snippets with real numbers
- Review scores and counts
- 安全性 badges (where relevant)

**Placement:** Near CTAs and after benefit claims

### 6. 异议处理

**Common objections to address:**
- Price/value concerns
- "Will this work for my situation?"
- Implementation difficulty
- "What if it doesn't work?"

**Address through:** 常见问题 sections, guarantees, comparison content, process transparency

### 7. 摩擦点

**Look for:**
- Too many form fields
- Unclear next steps
- Confusing navigation
- 必需 information that shouldn't be required
- Mobile experience issues
- Long load times

---

## 输出格式

Structure your recommendations as:

### 速赢（立即实施）
Easy changes with likely immediate impact.

### 高影响更改（优先）
Bigger changes that require more effort but will significantly improve conversions.

### 测试创意
Hypotheses worth A/B testing rather than assuming.

### 文案备选
For key elements (headlines, CTAs), provide 2-3 alternatives with rationale.

---

## 页面特定框架

### 首页 CRO
- Clear positioning for cold visitors
- Quick path to most common conversion
- Handle both "ready to buy" and "still researching"

### 着陆页 CRO
- Message match with traffic source
- Single CTA (remove navigation if possible)
- Complete 参数 on one page

### 定价页面 CRO
- Clear plan comparison
- Recommended plan indication
- Address "which plan is right for me?" anxiety

### 功能页面 CRO
- Connect feature to benefit
- Use cases and examples
- Clear path to try/buy

### 博客文章 CRO
- 上下文ual CTAs matching content topic
- Inline CTAs at natural stopping points

---

## 实验创意

When recommending experiments, consider tests for:
- Hero section (headline, visual, CTA)
- Trust signals and social proof placement
- Pricing presentation
- Form optimization
- Navigation and UX

**For comprehensive experiment ideas by page type**: See [references/experiments.md](references/experiments.md)

---

## 任务特定问题

1. What's your current conversion rate and goal?
2. Where is traffic coming from?
3. What does your signup/purchase flow look like after this page?
4. Do you have user research, heatmaps, or 会话 recordings?
5. What have you already tried?

---

## 相关技能

- **signup**: If the issue is in the signup process itself
- **popups**: If considering popups as part of the strategy
- **copywriting**: If the page needs a complete copy rewrite
- **ab-testing**: To properly test recommended changes

---

## 表单优化

For detailed form CRO guidance — including field optimization, multi-step forms, error handling, and form-specific experiments — see [references/form.md](references/form.md).
