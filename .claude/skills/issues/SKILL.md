---
name: issues
description: "Issues — Issues 相关功能和最佳实践"
allowed-tools: Bash(gh *)
risk: unknown
source: community
metadata:
  author: Shpigford
  version: "1.0"
---

Interact with GitHub issues - create, list, and view issues.

## When to Use
- The user wants to create, list, inspect, or otherwise work with GitHub issues.
- The task involves issue intake or repository issue management through the GitHub CLI workflow.
- You need a guided issue flow that gathers titles, descriptions, and action selection before running commands.

## Instructions

This command helps you work with GitHub issues using the `gh` CLI.

### Step 1: Determine Action

Use AskUserQuestion to ask what the user wants to do:

**Question:**
- question: "What would you like to do with GitHub issues?"
- header: "Action"
- multiSelect: false
- options:
  - label: "Create new issue"
    description: "Open a new issue with title, body, and optional labels"
  - label: "List issues"
    description: "View open issues in the current repository"
  - label: "View issue"
    description: "See details of a specific issue by number"

---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 36 MINUTES 48 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE