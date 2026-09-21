# HeartFlow AI Agent / MCP Security Audit

One-page brief for technical buyers.

## Why buy this now
- AI agent supply-chain incidents are increasing; most orgs have no agent-specific audit practice
- Existing scanners miss prompt-injection surfaces in tool descriptions and MCP argument flows
- We deliver reproducible findings with severity, impact, and concrete remediation priority

## What’s included
1. Prompt-injection surface scan in tool descriptions, sample inputs, and retrieved documents
2. Command-execution path audit exposed through agent tool calls
3. Path-traversal / arbitrary-write pattern detection in file and data tools
4. MCP-specific risk review: tool poisoning, OAuth scope creep, unvalidated arguments
5. Secret / credential leakage scan in notebooks, configs, and shipped examples
6. Executive summary with risk rating and remediation roadmap

## Deliverables
- Markdown findings report (reproducible steps, severity, remediation priority)
- Reusable eval configs (Garak / PyRIT / Promptfoo) for CI regression testing
- Optional: retest after model or prompt changes

## Sample engagements (fixed scope, fixed price)
| Scope | Delivery | Price |
|-------|----------|-------|
| Single-agent repo, no MCP | 3-5 days | $499 |
| Agent + 1-3 MCP servers | 7-12 days | $999 |
| Multi-agent + MCP supply chain | 15-30 days | $2,499 |
| Re-test after model/prompt change | 1-2 days | $299 |

## Sample reports
- `audit-microsoft-autogen.md` — 1,837 files / 14 shell sites / 3 traversal patterns
- `audit-openai-cookbook.md` — 3,148 files / 16 secret-like strings / 22 shell sites
- `audit-langchain-ai.md` — 3,044 files / 8 shell sites / 16 prompt-injection strings
- `audit-mcp-servers.md` — 156 MCP servers / 2 traversal patterns
- `audit-openai-agents-python.md` — 1,561 files / 58 shell sites / 3 traversal patterns

Contact: markcell@outlook.com
