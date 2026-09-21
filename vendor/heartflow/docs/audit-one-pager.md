# HeartFlow — AI Agent / MCP Security Audit

One-page capability brief for technical buyers.

## Why this matters now
- 88% of enterprise AI agent pilots never reach production (CISO survey, 2026)
- Prompt injection attacks up 340% YoY; mapped to 6 of OWASP Top 10 Agentic Risks
- Only 8.5% of MCP servers implement mandatory OAuth 2.1
- A single successful prompt injection against an enterprise agent with write access averages $2.8M incident cost

## What we audit
1. **Prompt-injection surfaces** in tool descriptions, sample inputs, and retrieved documents
2. **Command-execution paths** exposed through agent tool calls
3. **Path-traversal / arbitrary-write** patterns in file and data tools
4. **MCP-specific risks**: tool poisoning, OAuth scope creep, unvalidated arguments, missing warning language
5. **Secret / credential leakage** in notebooks, configs, and shipped examples

## Deliverables
- Markdown findings report (severity, reproducible steps, remediation priority)
- Reusable eval configs (Garak / PyRIT / Promptfoo) for CI regression
- Optional: follow-up retest after model or prompt changes

## Sample engagements (fixed scope, fixed price)
| Scope | Delivery | Price (CNY) |
|-------|----------|-------------|
| Single-agent repo, no MCP | 3-5 days | ¥15,000 |
| Agent + 1-3 MCP servers | 7-12 days | ¥30,000 |
| Multi-agent + MCP supply chain | 15-30 days | ¥60,000 |
| Re-test after model/prompt change | 1-2 days | ¥8,000 |

## Proof
- `audit-microsoft-autogen.md` — 1,837 files / 14 shell sites / 3 traversal patterns
- `audit-openai-cookbook.md` — 3,148 files / 16 secret-like strings / 22 shell sites
- `audit-langchain-ai.md` — 3,044 files / 8 shell sites / 16 prompt-injection strings
- `audit-mcp-servers.md` — 156 MCP servers / 2 traversal patterns
- `audit-openai-agents-python.md` — 1,561 files / 58 shell sites / 3 traversal patterns

Contact: markcell@outlook.com
