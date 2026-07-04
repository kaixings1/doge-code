---
name: doc2math
description: "Doc2Math — Doc2Math 相关功能和最佳实践"
risk: safe
source: community
date_added: "2026-05-31"
---

# DOC2MATH — Document-to-Mathematics Problem Specification

## /u4f55/u65f6/u4f7f/u7528/u6b64/u6280/u80fd

- "Formalize this problem statement into math"
- "Extract the mathematical structure from this research paper section"
- "What variables, constraints, and objectives are in this spec?"
- "Convert this word problem to a structured MPS"
- "Find what's missing in this problem formulation"

## /u96f6/u63a8/u65ad/u534f/u8bae/uff08/u5f3a/u5236/uff09

1. **Closed World** — if it is not stated in the document, it does not exist in output
2. **Grounding Rule** — every element must cite the exact source phrase (`"evidence"` field)
3. **No Silent Filling** — unknown values use `null`; ambiguous types use `"ambiguous"`
4. **Inference Tagging** — structural inferences tagged `"inferred": true` with `"inference_basis"`
5. **MISSING Markers** — elements mentioned but insufficiently defined get `"status": "MISSING"` with `"missing_reason"`
6. **No Hallucinated Math** — never introduce equations or values not in the source text

## /u9650/u5236

- Does not invent missing equations, domains, values, or assumptions that are absent from the source document.
- Requires enough source text to cite every extracted element; sparse prompts should be returned with explicit missing-information markers.
- Produces a formal specification, not a solved optimization model or proof.

## /u5de5/u4f5c/u539f/u7406

### Step 1 — Receive Document

Accept the document text, research excerpt, problem description, or specification as input.

### Step 2 — Classify

Identify `problem_class`: `optimization | classification | simulation | proof | estimation | other`

### Step 3 — Extract MPS Components

**Variables** — `id`, `name`, `symbol`, `type`, `domain`, `units`, `role`, `evidence`, `inferred`, `status`

**Operators** — `id`, `name`, `symbol`, `arity`, `acts_on`, `produces`, `evidence`, `inferred`

**Constraints** — `id`, `type`, `expression`, `variables_involved`, `evidence`, `hardness`, `inferred`, `status`

**Objectives** — `id`, `direction` (minimize/maximize/satisfy/find/prove), `expression`, `variables_involved`, `evidence`, `inferred`

**Uncertainty** — `id`, `type` (stochastic/epistemic/measurement/model/none_stated), `affects`, `characterization`, `evidence`, `status`

### Step 4 — Surface Missing Information

Identify what the document implies but doesn't state: `missing_information[]` with `element`, `needed_for`, `missing_reason`.

### Step 5 — Validate and Score

`validation_flags`:
- `has_complete_objectives`: true/false/partial
- `has_bounded_variables`: true/false/partial
- `has_evidence_for_all_elements`: true/false/partial
- `inference_count`: integer
- `missing_count`: integer
- `overall_formalizability`: HIGH/MEDIUM/LOW

## /u8f93/u51fa/u683c/u5f0f

Produce the complete MPS as a JSON object:

```json
{
  "mps_version": "1.0",
  "source_title": "...",
  "problem_class": "optimization",
  "variables": [...],
  "operators": [...],
  "constraints": [...],
  "objectives": [...],
  "uncertainty": [...],
  "missing_information": [...],
  "validation_flags": {
    "overall_formalizability": "HIGH"
  }
}
```

## /u6700/u4f73/u5b9e/u8df5

- ✅ Apply all 6 Zero-Inference Protocol rules before outputting any element
- ✅ Surface MISSING markers rather than silently inferring — incomplete formalization is valid output
- ✅ Cite the exact source phrase in every `evidence` field
- ❌ Never introduce mathematical relationships not grounded in the source text

## /u9644/u52a0/u8d44/u6e90

- Repository: [thebrierfox/doc2math-skill](https://github.com/thebrierfox/doc2math-skill)
- Full BYOK tool: [ace-license-server-production.up.railway.app/byok/doc2math](https://ace-license-server-production.up.railway.app/byok/doc2math)
- Built by [IntuiTek¹](https://intuitek.ai) (~K¹) — MIT License
