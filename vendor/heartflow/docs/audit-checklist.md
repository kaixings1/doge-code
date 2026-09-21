# HeartFlow Audit Methodology

This document describes the static checks performed by `scripts/repo-audit.js` for AI agent / MCP security audits.

## Coverage

### 1. Secrets / Credentials
- High-entropy strings
- AWS / GCP / Azure style keys
- Private key / secret / token patterns in notebooks and configs

### 2. Command Execution
- `subprocess` / `os.system` / `exec` / `shell=True`
- Dynamic command construction from user input
- Unsandboxed code execution in agent tools

### 3. Path Traversal
- User-controlled file paths without normalization
- `open(..., 'w')` / `write_text` on dynamic paths
- Directory escape sequences (`../`, absolute path override)

### 4. Prompt Injection Surfaces
- Tool descriptions containing imperative instructions
- Sample inputs / docstrings containing jailbreak patterns
- Unvalidated retrieved documents passed to model context

### 5. MCP-Specific Risks
- Tool poisoning via description fields
- OAuth scope over-exposure
- Unvalidated tool arguments leading to host RCE
- Missing warning language for destructive tools

## Deliverables

Every audit engagement produces:

1. **Findings report** — markdown, one section per category, severity, reproducible steps
2. **Remediation guidance** — ordered by risk, with code-level fix suggestions
3. **Reusable evals** — Garak / PyRIT / Promptfoo configs tailored to the audited agent

## Limitations

Static analysis only. Runtime behavior, model-specific jailbreaks, and multi-step chain attacks require dynamic red-teaming.
