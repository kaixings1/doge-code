---
name: 日期文本解析
description: "解析和规范化日期、从文本中提取结构化信息、构建正则表达式模式。适用于清理混乱的日期格式、从文本列中提取实体或为非结构化数据构建解析逻辑。"
---

# Parse Dates & Text

## Purpose
Extract structured information from messy date strings, free-text columns, and unstructured data. Build robust parsing logic that handles real-world inconsistencies.

## How It Works

### Step 1: Date Parsing
- Detect date formats automatically across the dataset
- Handle mixed formats within a single column (US vs EU, with/without time)
- Parse relative dates ("3 days ago", "last Monday")
- Handle timezone-aware and timezone-naive datetimes
- Convert Unix timestamps, ISO 8601, and custom formats
- Generate `pd.to_datetime()` code with appropriate `format` and `errors` parameters

### Step 2: Text Extraction
- **Regex patterns**: Build and explain regex for common extraction tasks
  - Emails, phone numbers, URLs, IP addresses
  - Currency amounts, percentages
  - Product codes, order IDs, SKUs
- **Structured extraction**: Parse addresses, names, key-value pairs
- **Delimiter-based**: Split compound fields into separate columns

### Step 3: Text Normalization
- Case normalization (lowercase, title case)
- Whitespace cleanup (strip, collapse multiple spaces)
- Unicode normalization (NFD/NFC, accent removal)
- Abbreviation expansion
- Spelling correction for categorical values (fuzzy matching)

### Step 4: Validation
- Check parsed results against expected patterns
- Report parsing failures with context for manual review
- Generate a confidence score for ambiguous parses

## Usage Examples

**Example 1: Mixed date formats**
```
"This column has dates like '03/08/2026', 'March 8, 2026', '2026-03-08',
and 'Mar 8th 26' — normalize them all to ISO format"
```

**Example 2: Extract from text**
```
"Extract the dollar amount, date, and vendor name from these
expense report descriptions"
```

## Output Format

- **Parsing Rules**: Detected patterns with confidence levels
- **Python Code**: Robust parsing implementation with error handling
- **Failure Report**: Rows that couldn't be parsed, with suggested fixes
- **Validation Summary**: Success rate and edge cases
