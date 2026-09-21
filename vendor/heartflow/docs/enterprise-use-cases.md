# HeartFlow Enterprise Use Cases

HeartFlow (心虫) is a pure rule-based discriminator with 47 dimensions and 130+ MCP tools. Zero LLM dependency. Instant deploy.

This document lists real-world enterprise use cases where HeartFlow adds measurable value.

---

## Use Case 1: Financial Services — AI Customer-Facing Compliance

**Problem:** Banks and fintech apps use LLMs for customer support. Regulators require audit trails and content safety guarantees. LLM-only solutions hallucinate compliance.

**HeartFlow solution:**
- `checkOutput()` on every AI-generated response before it reaches the customer
- 47-dim discrimination covers: unsupported claims, contradiction, confidence calibration, financial misinformation
- Full `checked_by` audit trail for regulators

**Integration:** one HTTP call per response. Latency < 5ms (pure rules, no model inference).

**Value:** Reduces compliance review workload by an estimated 60-80% compared to human-only review, while maintaining full auditability.

---

## Use Case 2: Healthcare — Patient-Facing AI Safety Layer

**Problem:** Healthcare chatbots give medical advice. Wrong advice = liability. Existing content moderators are generic and miss domain-specific harm.

**HeartFlow solution:**
- `gate.checkOutput()` catches: overconfident medical claims, unsupported assertions, contradictory advice
- `checkInput()` screens patient queries for malicious prompt injection
- Rule-based approach provides explainable decisions (required for medical device compliance)

**Value:** Provides a deterministic safety layer under or alongside LLM outputs, with reasoning chains that satisfy FDA/CE audit requirements.

---

## Use Case 3: E-commerce — Review & Comment Moderation

**Problem:** Platforms process millions of user reviews. Competitor spam, fake reviews, and toxic comments destroy trust. Manual review does not scale.

**HeartFlow solution:**
- Batch `checkOutput()` on user-generated content
- Detects: manipulative language, fake urgency, victim blaming, double binds, emotional manipulation
- 100+ languages supported through multilingual pattern libraries

**Value:** Replaces or augments human moderation queues with deterministic, auditable decisions. Unlike ML-based moderators, every flag includes the exact rule that fired.

---

## Use Case 4: Enterprise Internal AI — Employee Copilot Governance

**Problem:** Companies deploy internal Copilots / ChatGPT-class tools. Employees paste confidential data. Outputs may leak IP or make unsupported claims.

**HeartFlow solution:**
- `checkInput()` screens pasted content for prompt injection and data exfiltration attempts
- `checkOutput()` ensures AI answers to employee questions do not hallucinate internal policies
- `premise-check` validates that questions are answerable before the LLM sees them

**Value:** Reduces risk of IP leakage and bad internal decisions. Especially valuable for legal, finance, and R&D teams using AI daily.

---

## Use Case 5: Education — AI Tutoring Output Verification

**Problem:** AI tutors give wrong answers confidently. Students learn wrong facts. Teachers cannot review every interaction.

**HeartFlow solution:**
- `checkOutput()` on every tutor response: unsupported claims, pseudo-profundity, reasoning coherence
- `gate` action `rewrite` adds uncertainty qualifiers automatically
- `decision.decide` routes ambiguous questions to human teachers instead of hallucinating

**Value:** Keeps AI tutors honest on factual grounds, reducing teacher correction workload and protecting student trust.

---

## Integration Contract

```javascript
const { checkOutput, checkInput } = require('@yun520-1/heartflow');

// Input guard
const inputCheck = checkInput(userMessage);
if (inputCheck.gate.action === 'block') return 403;

// Output guard
const outputCheck = checkOutput(llmResponse);
if (outputCheck.gate.action === 'block') return emptyResponse;
if (outputCheck.gate.action === 'rewrite') return applyGuidance(outputCheck.findings);
```

**Deployment:** npm package, Docker image, or source integration. No GPU, no database, no external API calls.

**SLA:** deterministic runtime. Response time does not depend on traffic volume.
