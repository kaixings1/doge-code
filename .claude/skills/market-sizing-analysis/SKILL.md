---
name: market-sizing-analysis
description: "计算总可用市场 (TAM)、可服务可用市场 (SAM) 和可服务可获得市场 (SOM) 的全面市场估算方法。"
risk: safe
source: community
date_added: '2026-02-27'
---

# Market Sizing Analysis

Comprehensive market sizing methodologies for calculating Total Addressable Market (TAM), Serviceable Available Market (SAM), and Serviceable Obtainable Market (SOM) for startup opportunities.

## 使用此技能的场景

- Working on market sizing analysis tasks or workflows
- Needing guidance, 最佳实践, or checklists for market sizing analysis

## 不要使用此技能的场景

- The task is unrelated to market sizing analysis
- You need a different domain or tool outside this scope

## 使用说明

- Clarify goals, constraints, and required inputs.
- Apply relevant 最佳实践 and validate outcomes.
- Provide actionable steps and verification.
- If detailed 示例 are required, open `resources/implementation-playbook.md`.

## 概述

Market sizing provides the foundation for startup strategy, fundraising, and business planning. Calculate market opportunity using three complementary methodologies: top-down (industry reports), bottom-up (customer segment calculations), and value theory (willingness to pay).

## 核心概念

### The Three-Tier Market Framework

**TAM (Total Addressable Market)**
- Total revenue opportunity if achieving 100% market share
- Defines the universe of potential customers
- Used for long-term vision and market validation
- Example: All email marketing software revenue globally

**SAM (Serviceable Available Market)**
- Portion of TAM targetable with current product/service
- Accounts for geographic, segment, or capability constraints
- Represents realistic addressable opportunity
- Example: AI-powered email marketing for e-commerce in North America

**SOM (Serviceable Obtainable Market)**
- Realistic market share achievable in 3-5 years
- Accounts for competition, resources, and market dynamics
- Used for financial projections and fundraising
- Example: 2-5% of SAM based on competitive landscape

### 使用场景 Each Methodology

**Top-Down Analysis**
- Use when established market research exists
- Best for mature, well-defined markets
- Validates market existence and growth
- Starts with industry reports and narrows down

**Bottom-Up Analysis**
- Use when targeting specific customer segments
- Best for new or niche markets
- Most credible for investors
- Builds from customer data and pricing

**Value Theory**
- Use when creating new market categories
- Best for disruptive innovations
- Estimates based on value creation
- Calculates willingness to pay for problem solution

## Three-Methodology Framework

### Methodology 1: Top-Down Analysis

Start with total market size and narrow to addressable segments.

**Process:**
1. Identify total market category from research reports
2. Apply geographic filters (target regions)
3. Apply segment filters (target industries/customers)
4. Calculate competitive positioning adjustments

**Formula:**
```
TAM = Total Market Category Size
SAM = TAM × Geographic % × Segment %
SOM = SAM × Realistic Capture Rate (2-5%)
```

**使用场景:** Established markets with available research (e.g., SaaS, fintech, e-commerce)

**Strengths:** Quick, uses credible data, validates market existence

**限制:** May overestimate for new categories, less granular

### Methodology 2: Bottom-Up Analysis

Build market size from customer segment calculations.

**Process:**
1. Define target customer segments
2. Estimate number of potential customers per segment
3. Determine average revenue per customer
4. Calculate realistic penetration rates

**Formula:**
```
TAM = Σ (Segment Size × Annual Revenue per Customer)
SAM = TAM × (Segments You Can Serve / Total Segments)
SOM = SAM × Realistic Penetration Rate (Year 3-5)
```

**使用场景:** B2B, niche markets, specific customer segments

**Strengths:** Most credible for investors, granular, defensible

**限制:** 需要 detailed customer research, time-intensive

### Methodology 3: Value Theory

Calculate based on value created and willingness to pay.

**Process:**
1. Identify problem being solved
2. Quantify current cost of problem (time, money, inefficiency)
3. Calculate value of solution (savings, gains, efficiency)
4. Estimate willingness to pay (typically 10-30% of value)
5. Multiply by addressable customer base

**Formula:**
```
Value per Customer = Problem Cost × % Solved by Solution
Price per Customer = Value × Willingness to Pay % (10-30%)
TAM = Total Potential Customers × Price per Customer
SAM = TAM × % Meeting Buy Criteria
SOM = SAM × Realistic Adoption Rate
```

**使用场景:** New categories, disruptive innovations, unclear existing markets

**Strengths:** Shows value creation, works for new markets

**限制:** 需要 assumptions, harder to validate

## Step-by-Step Process

### 步骤 1: Define the Market

Clearly specify what market is being measured.

**Questions to answer:**
- What problem is being solved?
- Who are the target customers?
- What's the product/service category?
- What's the geographic scope?
- What's the time horizon?

**Example:**
- Problem: E-commerce companies struggle with email marketing automation
- Customers: E-commerce stores with >$1M annual revenue
- Category: AI-powered email marketing software
- Geography: North America initially, global expansion
- Horizon: 3-5 year opportunity

### 步骤 2: Gather Data Sources

Identify credible data for calculations.

**Top-Down Sources:**
- Industry research reports (Gartner, Forrester, IDC)
- Government statistics (Census, BLS, trade associations)
- Public company filings and earnings
- Market research firms (Statista, CB Insights, PitchBook)

**Bottom-Up Sources:**
- Customer interviews and surveys
- Sales data and CRM records
- Industry databases (LinkedIn, ZoomInfo, Crunchbase)
- Competitive intelligence
- Academic research

**Value Theory Sources:**
- Customer problem quantification
- Time/cost studies
- ROI case studies
- Pricing research and willingness-to-pay surveys

### 步骤 3: Calculate TAM

Apply chosen methodology to determine total market.

**For Top-Down:**
1. Find total category size from research
2. Document data source and year
3. Apply growth rate if needed
4. Validate with multiple sources

**For Bottom-Up:**
1. Count total potential customers
2. Calculate average annual revenue per customer
3. Multiply to get TAM
4. Break down by segment

**For Value Theory:**
1. Quantify total addressable customer base
2. Calculate value per customer
3. Estimate pricing based on value
4. Multiply for TAM

### 步骤 4: Calculate SAM

Narrow TAM to serviceable addressable market.

**Apply Filters:**
- Geographic constraints (regions you can serve)
- Product 限制 (features you currently have)
- Customer requirements (size, industry, use case)
- Distribution channel access
- Regulatory or compliance restrictions

**Formula:**
```
SAM = TAM × (% matching all filters)
```

**Example:**
- TAM: $10B global email marketing
- Geographic 过滤器: 40% (North America)
- Product 过滤器: 30% (e-commerce focus)
- Feature 过滤器: 60% (need AI 能力)
- SAM = $10B × 0.40 × 0.30 × 0.60 = $720M

### 步骤 5: Calculate SOM

Determine realistic obtainable market share.

**考虑:**
- Current market share of competitors
- Typical market share for new entrants (2-5%)
- Resources available (funding, team, time)
- Go-to-market effectiveness
- Competitive advantages
- Time to achieve (3-5 years typically)

**Conservative 方法:**
```
SOM (Year 3) = SAM × 2%
SOM (Year 5) = SAM × 5%
```

**Example:**
- SAM: $720M
- Year 3 SOM: $720M × 2% = $14.4M
- Year 5 SOM: $720M × 5% = $36M

### Step 6: Validate and Triangulate

Cross-check using multiple methods.

**Validation Techniques:**
1. Compare top-down and bottom-up results (should be within 30%)
2. Check against public company revenues in space
3. Validate customer count assumptions
4. Sense-check pricing assumptions
5. Review with industry experts
6. Compare to similar market categories

**Red Flags:**
- TAM that's too small (< $1B for VC-backed startups)
- TAM that's too large (unsupported by data)
- SOM that's too aggressive (> 10% in 5 years for new entrant)
- Inconsistency between methodologies (> 50% difference)

## Industry-Specific 考虑ations

### SaaS Markets

**Key Metrics:**
- Number of potential businesses in target segment
- Average contract value (ACV)
- Typical market penetration rates
- Expansion revenue potential

**TAM Calculation:**
```
TAM = Total Target Companies × Average ACV × (1 + Expansion Rate)
```

### Marketplace Markets

**Key Metrics:**
- Gross Merchandise Value (GMV) of category
- Take rate (% of GMV you capture)
- Total transactions or users

**TAM Calculation:**
```
TAM = Total Category GMV × Expected Take Rate
```

### Consumer Markets

**Key Metrics:**
- Total addressable users/households
- Average revenue per user (ARPU)
- Engagement frequency

**TAM Calculation:**
```
TAM = Total Users × ARPU × Purchase Frequency per Year
```

### B2B Services

**Key Metrics:**
- Number of target companies by size/industry
- Average project value or retainer
- Typical buying frequency

**TAM Calculation:**
```
TAM = Total Target Companies × Average Deal Size × Deals per Year
```

## Presenting Market Sizing

### For Investors

**Structure:**
1. Market definition and problem scope
2. TAM/SAM/SOM with methodology
3. Data sources and assumptions
4. Growth projections and drivers
5. Competitive landscape context

**Key Points:**
- Lead with bottom-up calculation (most credible)
- Show triangulation with top-down
- Explain conservative assumptions
- Link to revenue projections
- Highlight market growth rate

### For Strategy

**Structure:**
1. Addressable customer segments
2. Prioritization by opportunity size
3. Entry strategy by segment
4. Expected penetration timeline
5. Resource requirements

**Key Points:**
- Focus on SAM and SOM
- Show segment-level detail
- Connect to go-to-market plan
- Identify expansion opportunities
- Discuss competitive positioning

## Common Mistakes to Avoid

**Mistake 1: Confusing TAM with SAM**
- Don't claim entire market as addressable
- Apply realistic product/geographic constraints
- Be honest about serviceable market

**Mistake 2: Overly Aggressive SOM**
- New entrants rarely capture > 5% in 5 years
- Account for competition and resources
- Show realistic ramp timeline

**Mistake 3: Using Only Top-Down**
- Investors prefer bottom-up validation
- Top-down alone lacks credibility
- 始终 triangulate with multiple methods

**Mistake 4: Cherry-Picking Data**
- Use consistent, recent data sources
- Don't mix methodologies inappropriately
- Document all assumptions clearly

**Mistake 5: Ignoring Market Dynamics**
- Account for market growth/decline
- 考虑 competitive intensity
- Factor in switching costs and barriers

## Additional Resources

### Reference Files

For detailed methodologies and frameworks:
- **`references/methodology-deep-dive.md`** - Comprehensive guide to each methodology with step-by-step worksheets
- **`references/data-sources.md`** - Curated list of market research sources, databases, and tools
- **`references/industry-templates.md`** - Specific templates for SaaS, marketplace, consumer, B2B, and fintech markets

### Example Files

Working 示例 with complete calculations:
- **`示例/saas-market-sizing.md`** - Complete TAM/SAM/SOM for a B2B SaaS product
- **`示例/marketplace-sizing.md`** - Marketplace platform market opportunity calculation
- **`示例/value-theory-example.md`** - Value-based market sizing for disruptive innovation

Use these 示例 as templates for your own market sizing analysis. Each includes real numbers, data sources, and assumptions documented clearly.

## 快速开始

To perform market sizing analysis:

1. **Define the market** - Problem, customers, category, geography
2. **Choose methodology** - Bottom-up (preferred) or top-down + triangulation
3. **Gather data** - Industry reports, customer data, competitive intelligence
4. **Calculate TAM** - Apply methodology formula
5. **Narrow to SAM** - Apply product, geographic, segment filters
6. **Estimate SOM** - 2-5% realistic capture rate
7. **Validate** - Cross-check with alternative methods
8. **Document** - Show methodology, sources, assumptions
9. **Present** - Structure for audience (investors, strategy, operations)

For detailed step-by-step guidance on each methodology, reference the files in `references/` directory. For complete worked 示例, see `示例/` directory.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
