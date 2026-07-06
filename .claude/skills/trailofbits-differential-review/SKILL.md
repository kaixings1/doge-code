# Differential Review

Security-focused differential review of code changes with git history analysis and blast radius estimation.

**Author:** Omar Inuwa

## 使用场景

当您需要以下操作时使用此技能：
- 审查 PR、提交或差异以发现安全漏洞
- 检测安全回归（重新引入的漏洞）
- 分析代码更改的影响范围
- 检查修改代码的测试覆盖差距

## What It Does

This skill performs comprehensive security review of code changes:

- **Risk-First Analysis** - Prioritizes auth, crypto, value transfer, external calls
- **Git History Analysis** - Uses blame to understand why code existed and detect regressions
- **Blast Radius Calculation** - Quantifies impact by counting callers
- **Test Coverage Gaps** - Identifies untested changes
- **Adaptive Depth** - Scales analysis based on codebase size (small/medium/large)

## 安装

```
/plugin install trailofbits/skills/plugins/differential-review
```

## Documentation Structure

This skill uses a **modular documentation architecture** for 令牌 efficiency and progressive disclosure:

### Core Entry Point
- **[SKILL.md](skills/differential-review/SKILL.md)** - Main entry point (217 lines)
  - 快速参考 tables for triage
  - Decision tree routing to detailed docs
  - Quality checklist and red flags
  - 集成 with other skills

### Supporting Documentation
- **[methodology.md](skills/differential-review/methodology.md)** - Detailed phase-by-phase 工作流 (~200 lines)
  - Pre-Analysis: Baseline context building
  - Phase 0: Intake & Triage
  - Phase 1: Changed Code Analysis
  - Phase 2: Test Coverage Analysis
  - Phase 3: Blast Radius Analysis
  - Phase 4: Deep Context Analysis

- **[adversarial.md](skills/differential-review/adversarial.md)** - Attacker modeling and exploit scenarios (~150 lines)
  - Phase 5: Adversarial Vulnerability Analysis
  - Attacker model definition (WHO/ACCESS/INTERFACE)
  - Exploitability rating framework
  - Complete exploit scenario templates

- **[reporting.md](skills/differential-review/reporting.md)** - Report structure and formatting (~120 lines)
  - Phase 6: Report Generation
  - 9-section report template
  - Formatting guidelines and conventions
  - File naming and notification templates

- **[patterns.md](skills/differential-review/patterns.md)** - Common vulnerability patterns (~80 lines)
  - Security regressions detection
  - Reentrancy, access control, overflow patterns
  - Quick detection bash commands

### Benefits of This Structure
- **令牌 Efficient** - Load only the documentation you need
- **Progressive Disclosure** - 快速参考 for triage, detailed docs for deep analysis
- **Maintainable** - Each concern separated into its own file
- **Navigable** - Decision tree routes you to the right document

## 工作流

The complete 工作流 spans Pre-Analysis + Phases 0-6:

1. **Pre-Analysis** - Build baseline context with `audit-context-building` skill (if available)
2. **Phase 0: Intake** - Extract changes, assess size, risk-score files
3. **Phase 1: Changed Code** - Analyze diffs, git blame, check for regressions
4. **Phase 2: Test Coverage** - Identify coverage gaps
5. **Phase 3: Blast Radius** - Calculate impact of changes
6. **Phase 4: Deep Context** - Five Whys root cause analysis
7. **Phase 5: Adversarial Analysis** - Hunt vulnerabilities with attacker model
8. **Phase 6: Report** - Generate comprehensive markdown report

**Navigation:** Use the decision tree in SKILL.md to jump directly to the phase you need.

## 输出

Generates a markdown report with:
- Executive summary with severity distribution
- Critical findings with attack scenarios and PoCs
- Test coverage analysis
- Blast radius analysis
- Historical context and regression risks
- Actionable recommendations

## Example Usage

```
Review the security implications of this PR:
git diff main..feature/auth-changes
```

## 相关技能

- `context-building` - Used for baseline context analysis
- `issue-writer` - Transform findings into formal audit reports
