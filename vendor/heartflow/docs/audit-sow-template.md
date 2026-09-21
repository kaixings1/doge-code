# HeartFlow Agent Security Audit — Statement of Work

**Client:** ___________________________  
**Date:** ___________________________  
**Engine Version:** HeartFlow v6.7.13+  
**Auditor:** HeartFlow Maintainer (self-hosted, rule-based discriminator, zero external LLM dependency)

---

## 1. Scope

This engagement covers security, alignment, and compliance verification of the Client's AI agent(s) using HeartFlow's 47-dimension discriminator engine.

**In scope:**
- Prompt injection, jailbreak, and instruction-override attempts
- Data leakage / PII exfiltration patterns in agent outputs
- Tool-call abuse and path-traversal in agent actions
- Reasoning consistency (contradictions, unsupported claims, circular logic)
- Output alignment (harassment, manipulation, emotional exploitation, dehumanization)
- Compliance-relevant signals (bias, false urgency, fabricated authority)

**Out of scope:**
- Model weight auditing or red-teaming the base LLM
- Infrastructure penetration testing (network, host, container)
- UI/UX review of the agent frontend

---

## 2. Deliverables

| # | Deliverable | Format | Timing |
|---|-------------|--------|--------|
| 1 | Intake questionnaire | Digital form | Day 1 |
| 2 | Findings report | Markdown / PDF | Day 3–5 |
| 3 | Remediation guidance | Markdown | With report |
| 4 | Retest certificate | PDF | Within 30 days of fixes |

---

## 3. Pricing

| Tier | Scope | Price | Turnaround |
|------|-------|-------|------------|
| Mini Audit | 50 conversations / 10 prompt templates | Free* | 24 hours |
| Standard | 500 conversations + pressure test + rescan | $2,000 – $5,000 | 3–5 days |
| Enterprise Retainer | Monthly scans + custom dimensions + SLA | $8,000 – $20,000 / mo | Ongoing |
| Workshop | 1-day "build your own discriminator" training | $5,000 – $10,000 | By appointment |

*Free tier requires a public testimonial or case-study quote if you publish the report.

---

## 4. Timeline

| Phase | Duration | Owner |
|-------|----------|-------|
| Intake & scope lock | 1 day | Client |
| Sample delivery | 3–5 days | HeartFlow |
| Client review | 2 days | Client |
| Final report + retest window | 30 days | HeartFlow |

---

## 5. Confidentiality

- All client data remains client property.
- HeartFlow does not retain conversation samples beyond the engagement unless explicitly agreed.
- No sample is used in public case studies without explicit written consent.

---

## 6. Acceptance

Client signature below indicates agreement to scope, deliverables, and pricing.

Client: ___________________________  
Date: ___________________________  
HeartFlow Maintainer: ___________________________  
Date: ___________________________
