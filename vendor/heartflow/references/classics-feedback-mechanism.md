# 思想心虫古典规则反哺机制参考文档

本文件记录 `classics-feedback.js` 的设计意图、使用方式和限制。

## 设计目标

从 `search_guji.sh` 命中原文中自动提取**潜在新触发词**，供规则维护者 Review 后手工加入 `classics-rules.js`。

**不自动改写规则**：规则变更必须人工确认，避免误触发。

## 文件结构

- `src/knowledge/classics-feedback.js` — 反哺核心模块
- `test/knowledge/classics-feedback.test.js` — 5 个单测
- `src/knowledge/classics-rules.js` — `evaluateRules` 输出增加 `feedbackSuggestions`

## API

```js
const { analyzeRuleCoverage, suggestFromHits, summarizeFeedback } = require('./src/knowledge/classics-feedback');

// 从 evaluateRules 输出提取覆盖建议
const coverage = analyzeRuleCoverage(evaluationResult, existingTriggers);

// 从 hits 直接提取建议
const suggestions = suggestFromHits(hits, existingTriggers);

// 汇总多规则反哺建议
const summary = summarizeFeedback(results);
```

## 输出结构

```js
{
  suggestions: [{ term: '无缘', freq: 3 }, ...],
  analyzedFindings: 2,
  hitCount: 5
}
```

## 限制

1. 停用词表覆盖佛学术语，可能误排除合法候选
2. 仅基于词频统计，无语义理解
3. `classics-rules.js` 的 `evaluateRules` 在每次调用时都会触发反哺计算，性能开销可控（<1ms）

## 与 classics-value-mapper 的关系

- `classics-value-mapper.js`：做知识检索（输入关键词 → 原文命中）
- `classics-rules.js`：做规则判别（输入文本 → 规则命中 + 原文验证）
- `classics-feedback.js`：做反哺分析（规则命中后 → 原文中未被覆盖的高频词 → 建议新触发词）

三者形成闭环：检索 → 判别 → 反哺优化。
