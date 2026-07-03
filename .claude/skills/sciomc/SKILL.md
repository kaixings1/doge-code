---
name: sciomc
description: "Sciomc — Sciomc 相关功能和最佳实践"
argument-hint: <research goal>
level: 4
---

# Research Skill

Orchestrate parallel scientist agents for comprehensive research workflows with optional AUTO mode for fully autonomous execution.

## Overview

Research is a multi-stage workflow that decomposes complex research goals into parallel investigations:

1. **Decomposition** - Break research goal into independent stages/hypotheses
2. **Execution** - Run parallel scientist agents on each stage
3. **Verification** - Cross-validate findings, check consistency
4. **Synthesis** - Aggregate results into comprehensive report

## Usage Examples

```
/oh-my-claudecode:sciomc <goal>                    # Standard research with user checkpoints
/oh-my-claudecode:sciomc AUTO: <goal>              # Fully autonomous until complete
/oh-my-claudecode:sciomc status                    # Check current research session status
/oh-my-claudecode:sciomc resume                    # Resume interrupted research session
/oh-my-claudecode:sciomc list                      # List all research sessions
/oh-my-claudecode:sciomc report <session-id>       # Generate report for session
```

### Quick Examples

```
/oh-my-claudecode:sciomc What are the performance characteristics of different sorting algorithms?
/oh-my-claudecode:sciomc AUTO: Analyze authentication patterns in this codebase
/oh-my-claudecode:sciomc How does the error handling work across the API layer?
```

## Research Protocol

### Stage Decomposition Pattern

When given a research goal, decompose into 3-7 independent stages:

```markdown
## Research Decomposition

**Goal:** <original research goal>

### Stage 1: <stage-name>
- **Focus:** What this stage investigates
- **Hypothesis:** Expected finding (if applicable)
- **Scope:** Files/areas to examine
- **Tier:** LOW | MEDIUM | HIGH

### Stage 2: <stage-name>
...
```

### Parallel Scientist Invocation

Fire independent stages in parallel via Task tool:

```
// Stage 1 - Simple data gathering
Task(subagent_type="oh-my-claudecode:scientist", model="haiku", prompt="[RESEARCH_STAGE:1] Investigate...")

// Stage 2 - Standard analysis
Task(subagent_type="oh-my-claudecode:scientist", model="sonnet", prompt="[RESEARCH_STAGE:2] Analyze...")

// Stage 3 - Complex reasoning
Task(subagent_type="oh-my-claudecode:scientist", model="opus", prompt="[RESEARCH_STAGE:3] Deep analysis of...")
```

### Smart Model Routing

**CRITICAL: Always pass `model` parameter explicitly!**

| Task Complexity | Agent | Model | Use For |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 02 MINUTES 29 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE