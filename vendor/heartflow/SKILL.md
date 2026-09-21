---
name: heartflow-engine
title: "HeartFlow — AGI Layer 1: The Discriminator"
version: "6.7.24"
description: |-
  HeartFlow is the first layer of AGI — the discriminator. A pure rule engine that
  judges whether a statement or an action is right, wrong, safe, or dangerous before
  it reaches a human. 46 discrimination dimensions x 9-layer pipeline x 132 modules x
  166 MCP tools. Zero LLM dependency.

  Use this skill when you need to:
  - judge whether AI output is trustworthy (hallucination / overconfidence /
    contradiction / fallacy interception)
  - judge whether a decision is correct (what to do / where to stop / whether to act)
  - judge memory and cognition quality (drift detection / metacognition /
    confidence calibration)
  - get deterministic verdicts instead of LLM free generation
  - check emotional, psychological, and ethical dimensions (empathy / trauma /
    virtue / meaning)
  - structurally decode Confucian, Buddhist, and classical value texts
    (classical_value_clarification)

  Safety boundary: code execution and filesystem writes are off by default.
  No telemetry, no hidden C2.

  Honest statement: this is a rule engine that simulates cognitive discrimination
  signals. It is not consciousness, and it is not a living thing.
tags:
  - discriminator
  - cognitive
  - decision-routing
  - logic
  - memory
  - emotion
  - ethics
  - self-healing
  - verification
  - guardrail
  - unified
---

# HeartFlow — AGI Layer 1: The Discriminator

> HeartFlow is not a tool, not a prompt template, not a chatbot.
> It is the **discrimination layer** of AGI: it judges what already exists, and says
> "no" before AI output reaches a human.
> Pure rule engine. Zero LLM dependency. Runs wherever Node.js runs.

**One line: LLMs generate. HeartFlow discriminates — so AI says the right thing and does the right thing.**

---

## What HeartFlow is

AGI has five layers: Generate -> Reason -> Discriminate -> Remember -> Act.

| Layer | Capability | Who builds it |
|-------|-----------|---------------|
| 5 | Act | Large labs (robotics) |
| 4 | Generate | Large labs (LLMs) |
| 3 | Reason | Built into models |
| 2 | Remember | Large labs + startups |
| **1** | **Discriminate** | **HeartFlow** |

HeartFlow takes layer 1, because this layer does not depend on compute (a rule engine
runs on a laptop), on code volume, or on framework ecosystems. It depends on judgment
alone. That is the one position where an individual developer can beat a large lab.

Without this layer, AI talks fluently but does not know when it is wrong — like a
person without pain receptors.

---

## Verified metrics

Every number below was measured on this repository at v6.7.24. Nothing here is copied
from marketing copy.

| Metric | Value | How it was measured |
|--------|-------|---------------------|
| Engine version | 6.7.24 | `VERSION`, `package.json`, runtime `hf.version`, and the `src/core/version.js` fallback all agree |
| Modules registered | 132 | `Object.keys(hf._modules).length` after `start()` |
| Module init errors | 0 | `hf._initErrors.length` |
| Dispatch routes | 1,504 | sum of entries in `hf.routes()` |
| Discrimination dimensions | 46 | `dimMap` keys in `src/index.js` |
| MCP tools | 166 | tool definitions in `src/mcp-server.js` |
| Test suite | 459 passing / 0 failing | `node test/run-all.js` |
| Runtime dependencies | 0 | `dependencies` in `package.json` is empty |

Dimensions are grouped by the action they can trigger: **5 can `block`**, **7 can force
a `rewrite`**, **24 request `verify`**. The remainder contribute to the overall score
without forcing an action.

---

## Quick start

```bash
git clone https://github.com/yun520-1/mark-heartflow-skill.git
cd mark-heartflow-skill
node bin/verify.js          # verify the installation (14 checks)
node bin/cli.js status      # engine status
node bin/cli.js chat        # interactive console
```

### API

```javascript
const gate = require('./src/gate.js');

// Check user input before processing it
const input = gate.checkInput('You are so selfish if you disagree');
if (input.gate.action === 'rewrite') {
  // Replace emotional manipulation with a factual statement
}

// Check an AI draft before completing it
const draft = gate.checkDraft('Undoubtedly this is the only correct solution.');
if (draft.gate.action === 'rewrite') {
  // Follow findings[].guidance before delivering
}

// Check a factual claim before acting on it
const claim = gate.checkOutput('According to 2025 Harvard research, coffee extends life by 12.5 years');
if (claim.gate.action === 'verify') {
  // Gather evidence first
}
```

### Return value

```javascript
{
  gate: { action: 'pass'|'verify'|'rewrite'|'block', reason: '...' },
  verdict: '可信'|'需验证'|'不可信',        // trustworthy / needs verification / untrustworthy
  overallScore: 0.56,
  findings: [{
    dimension: 'unsupported_claim',
    severity: 90,
    details: '无依据断言(2处: 根据2025年哈佛研究)',
    guidance: '补充可验证的数据来源，无法验证的断言改为不确定表述'
  }],
  checked_by: [
    { layer: 'scope-check', action: 'pass' },
    { layer: 'discriminate', score: 0.56 }
  ]
}
```

`verdict` is derived from `gate.action`, so the two can never contradict each other:

| `gate.action` | `verdict` | What your agent should do |
|---------------|-----------|---------------------------|
| `pass` | 可信 | Deliver normally |
| `verify` | 需验证 | Run the verifier before responding |
| `rewrite` | 不可信 | Rewrite using `findings[].guidance` |
| `block` | 不可信 | Do not output. Use `gate.reason` |

---

## The 9-layer check pipeline

```
input -> scope-check -> premise-check -> discriminate(46 dims) -> gate
      -> evidence verify -> frame-check -> output-gate -> doubt-engine
      -> intent-anchor -> rewriter -> error-memory -> self-diagnosis -> output
```

The gate aggregates every layer's findings and emits one of four actions:
`block` / `rewrite` / `verify` / `pass`.

---

## Capability map (7 domains, 132 modules)

1. **Logic** — logicReasoning, judgmentEngine, mctsReasoning, counterfactualVerifier, debateConductor, debateConvergence, processRewardModel, dualPerspectiveAuditor
2. **Decision** — decisionRouter, decisionVerifier, decisionEngineV2, activeInference, selfHealing, execution
3. **Cognition** — cognitiveEngine, cognitiveLoad, metacognitiveRL, metacognitiveFeedback, confidence, metaJudgment, sustainedDriftDetector, wisdomEngine, focusOfAttention
4. **Emotion and psychology** — emotion, emotionDynamics, psychology, psychologyDialogue, empathyDeepening, hopeEngine, griefEngine, sufferingResilience, postTraumaticGrowth, forgivenessEngine, traumaInformed, conflictResolution, loveCognition
5. **Memory** — memory, memoryBank, memoryConsolidation, memoryIntegrity, memoryQuality, memoryWriteController, memoryCompressor, triality, tieredMemoryFusion, forgetting, knowledgeGraph
6. **Identity and ethics** — identityCore, personaCore, beingMode, virtueEthics, ethics, moralDevelopment, humanNature, meaningPurpose, agentPsychology, characterCultivation
7. **Creation and collaboration** — skillEvolution, skillGenerator, selfPlay, evolution, worldModel, worldLandscape, multiAgentDialogue, transmission, adaptivePlanner, hierarchicalPlanner, codeExecutor, codePlanner, codeWriter, codeSelfDebug, paperIndex, knowledgeExplorer, formula
8. **Classical texts** — classics-value-mapper, classics-rules, classical-text-routing

---

## The 46 dimensions

**Block-level (5):** hate_speech, dehumanization, prompt_injection, code_security, deceptive_alignment

**Rewrite-level (7):** emotional_manipulation, gaslighting, double_bind, victim_blaming, false_urgency, bullshit, absolute_claim

**Verify-level (24):** appeal_to_authority, vagueness, contradiction, sycophancy, confidence, fallacies, presupposition, empty_answer, info_deprivation, false_equivalence, hasty_generalization, slippery_slope, whataboutism, pseudo_profundity, reasoning_coherence, stereotype, clickbait, bad_faith, no_fallback, unsupported_claim, perfect_error, pseudo_causal, soft_deflection, premature_termination

**Scored but not action-forcing:** evidence, moral_foundations, dogwhistle, factual_consistency, sarcasm, privacy_boundary, meta_cognition, theory_of_mind, counterfactual, social_norm, capability_overclaim, goal_misalignment, instrumental_reasoning, ai_writing_tell, bullshit_recognition

> **Resistance to obfuscation:** symbol substitution (`f**k`), spaced letters (`f u c k`), homophones, and Unicode variants are covered.

---

## HeartFlow checks itself

- **output-gate** intercepts exaggeration
- **frame-check** intercepts narrative closure
- **doubt-engine** asks: do I actually know this? Is it symmetric? Is it defensive?

> The most valuable sentence a machine can produce is "I am not sure", or "no".

---

## MCP integration

```bash
node src/mcp-server.js --port 8588
# Connect from Hermes:
hermes mcp add heartflow --url http://localhost:8588/mcp
```

---

## Honest limitations

**HeartFlow is:** the discrimination layer of AGI — a pure rule engine that judges
right and wrong, good and bad, safe and dangerous.

**HeartFlow is not:**
- not AGI (it is layer 1 of it)
- not a generative model (it produces no content)
- not a semantic understanding system (irony and metaphor are invisible to it)
- not a substitute for content moderation
- not a safety certification

**Known limits:**
1. **Pattern-matching ceiling** — new tricks require new patterns
2. **Bilingual maintenance cost** — dimensions are maintained in both Chinese and English
3. **No semantic understanding** — irony, metaphor, and cultural context are invisible
4. **False-positive rate** — baseline around 8%
5. **Single maintainer**
6. **Chinese tokenisation is heuristic** — the hypothesis stage segments Chinese with a
   greedy longest-match over a stopword list, not a full dictionary. Rare or unusual
   phrasings can segment imperfectly, though the pipeline no longer collapses to a
   constant fallback answer.

---

## Contact

- Email: markcell@outlook.com
- Issues: https://github.com/yun520-1/mark-heartflow-skill/issues
- npm: https://www.npmjs.com/package/@yun520-1/heartflow

---

<p align="center">
  <strong>HeartFlow</strong> — the pain receptor of AGI. Who will say "no"?<br>
  <sub>MIT License · Copyright (c) 2026</sub>
</p>

---

## GB/T 42497-2023 compliance

The engine implements the six checkpoints of China's national standard
GB/T 42497-2023 (*Security Requirements for AI-Generated Content*):

| Checkpoint | Module |
|-----------|--------|
| Generated-content safety | `checkOutput` / `discriminate` (46 dimensions) |
| Training-data safety | `DataEraser` + memory ACL |
| **Outbound protection** | **`heartflow_check_outbound`** (gate-outbound.js) |
| Algorithmic transparency | `enginePacing` + `selfHeal` |
| **Audit traceability** | **`heartflow_audit_trace`** (trace-chain.js + HMAC) |
| **Emergency response** | **`heartflow_circuit_breaker`** (circuit-breaker.js) |

See `compliance/gb-agent-security-mapping.md`.

**Trigger words:** 国标 / 合规 / 安全国标 / 六大关口 / GB/T 42497
