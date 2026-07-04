---
name: billing-自动化
description: "掌握自动计费系统，包括重复计费、发票生成、催款管理、按比例分摊和税务计算。"
risk: safe
source: community
date_added: "2026-02-27"
---

# Billing Automation

Master automated billing systems including recurring billing, invoice generation, dunning management, proration, and tax calculation.

## /u4f55/u65f6/u4f7f/u7528/u6b64/u6280/u80fd

- Implementing SaaS subscription billing
- Automating invoice generation and delivery
- Managing failed payment recovery (dunning)
- Calculating prorated charges for plan changes
- Handling sales tax, VAT, and GST
- Processing usage-based billing
- Managing billing cycles and renewals

## /u4e0d/u8981/u4f7f/u7528/u6b64/u6280/u80fd/u7684/u60c5/u51b5

- You only need a one-off invoice or manual billing
- The task is unrelated to billing or subscriptions
- You cannot change pricing, plans, or billing flows

## /u8bf4/u660e

- Define plans, pricing, billing intervals, and proration rules.
- Map subscription lifecycle states and renewal/cancellation behavior.
- Implement invoicing, payments, retries, and dunning workflows.
- Model taxes and compliance requirements per region.
- Validate with sandbox payments and reconcile ledger outputs.
- If detailed templates are required, open `resources/implementation-playbook.md`.

## 安全

- Do not charge real customers in testing environments.
- Verify tax handling and compliance obligations before production rollout.

## 资源

- `resources/implementation-playbook.md` for detailed patterns, checklists, and examples.

## /u9650/u5236
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
