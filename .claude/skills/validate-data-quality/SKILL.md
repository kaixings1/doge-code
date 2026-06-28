---
name: 数据质量验证
description: "评估六个维度的数据质量：完整性、准确性、一致性、及时性、唯一性和有效性。生成带有可操作修复步骤的数据质量计分卡。适用于审计数据集、设置质量监控或建立数据契约。"
---

# Validate Data Quality

## Purpose
Produce a comprehensive data quality scorecard that measures your dataset across six industry-standard dimensions. Provides actionable remediation steps and code to build ongoing quality monitoring.

## How It Works

### Step 1: Define Quality Expectations
- What does "good" look like for this dataset?
- Identify critical columns vs. nice-to-have columns
- Establish acceptable thresholds per dimension
- Reference data contracts or SLAs if available

### Step 2: Assess Six Dimensions

| Dimension | What It Measures | Example Checks |
|-----------|-----------------|----------------|
| **Completeness** | Are all required values present? | Null rates, empty strings, placeholder values |
| **Accuracy** | Do values reflect reality? | Range checks, lookup validation, statistical reasonableness |
| **Consistency** | Do values agree across sources? | Cross-column validation, referential integrity, format consistency |
| **Timeliness** | Is data fresh enough? | Latency from source, staleness detection, timestamp gaps |
| **Uniqueness** | Are there unwanted duplicates? | Primary key violations, fuzzy duplicates, entity resolution |
| **Validity** | Do values conform to rules? | Schema compliance, regex patterns, enum membership, business rules |

### Step 3: Generate Scorecard
- Score each dimension 0-100% per column and overall
- Color-code: 🟢 >90%, 🟡 70-90%, 🔴 <70%
- Rank issues by severity and business impact
- Produce a visual summary dashboard

### Step 4: Remediation Plan
- Prioritized list of fixes with effort estimates
- Python code for automated quality checks
- Great Expectations or Pandera validation suite generation
- Monitoring recommendations for ongoing quality tracking

## Usage Examples

**Example 1: Pre-analysis audit**
```
"Audit this customer dataset before I use it for segmentation analysis.
I need to trust the email, revenue, and signup_date columns."
```

**Example 2: Pipeline monitoring**
```
"Generate a Great Expectations suite for this dataset so we can
validate every new batch automatically"
```

## Output Format

- **Scorecard**: Visual summary with per-dimension scores
- **Issue Details**: Each issue with severity, affected rows, and examples
- **Remediation Plan**: Prioritized fixes with Python code
- **Monitoring Code**: Automated validation suite (Great Expectations / Pandera)
