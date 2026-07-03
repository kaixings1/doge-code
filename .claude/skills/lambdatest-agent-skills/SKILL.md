---
name: lambdatest-agent-skills
description: "46 个框架的生产级测试自动化技能，涵盖 15+ 种语言的 E2E、单元、移动、BDD、视觉和云测试。"
category: testing
risk: safe
source: community
source_repo: LambdaTest/agent-skills
source_type: community
date_added: "2026-04-16"
author: tanveer-farooq
tags: [testing, test-automation, e2e, unit-testing, mobile-testing, bdd, selenium, playwright, cypress, jest, pytest, appium, lambdatest]
tools: [claude, cursor, gemini, copilot]
license: "MIT"
license_source: "https://github.com/LambdaTest/agent-skills/blob/main/LICENSE"
---

# LambdaTest Agent Skills — Test Automation Registry (46 Skills)

## Overview

This skill is a curated index of 46 production-grade test automation skills sourced from the [LambdaTest/agent-skills](https://github.com/LambdaTest/agent-skills) repository. It teaches AI coding assistants how to write, structure, and execute test automation code across every major framework and 15+ programming languages. Instead of generating generic test code, the AI becomes a senior QA automation architect that understands correct project structure, dependency versions, cloud execution, CI/CD integration, and common debugging patterns for each framework.

This skill adapts material from an external GitHub repository:
- `source_repo: LambdaTest/agent-skills`
- `source_type: community`

## When to Use This Skill

- Use when you need to write, scaffold, or review test automation code for any major framework
- Use when working with Selenium, Playwright, Cypress, Jest, pytest, Appium, or any of the 46 supported frameworks
- Use when setting up a new test project and need the correct project structure, config files, and dependencies
- Use when integrating tests into a CI/CD pipeline (GitHub Actions, Jenkins, GitLab CI)
- Use when migrating tests between frameworks (e.g. Selenium → Playwright, Puppeteer → Cypress)
- Use when running tests on cloud infrastructure such as LambdaTest / TestMu AI
- Use when the user asks how to write, debug, or scale automated tests

## How It Works

### Step 1: Identify the Framework and Language

Determine which testing framework and programming language the user is working with. Match it to one of the 46 supported skills below. Each skill covers a specific framework with language-appropriate code patterns.

### Step 2: Apply the Correct Skill Context

Load the relevant framework skill from the registry below. Each skill includes: project setup and dependencies, core code patterns, page objects or test utilities, cloud execution configuration, CI/CD integration, a debugging table for common problems, and a best practices checklist.

### Step 3: Generate Production-Ready Test Code

Use the loaded skill context to generate test code that follows real-world conventions — not generic boilerplate. Apply correct import paths, configuration formats, assertion libraries, and runner commands specific to the framework and language.

### Step 4: Configure for Local or Cloud Execution

If the user wants to run tests locally, apply local runner configuration. If running on LambdaTest / TestMu AI cloud, configure RemoteWebDriver capabilities or the appropriate cloud SDK, and set `LT_USERNAME` and `LT_ACCESS_KEY` from environment variables — never hardcode credentials.

### Step 5: Add CI/CD Integration

When requested, generate a GitHub Actions (or Jenkins / GitLab CI) workflow that runs the tests in parallel, uploads reports, and captures artifacts on failure.

## Skill Registry

### 🌐 E2E / Browser Testing (15 skills)

| Skill | Languages | Description |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 36 MINUTES 08 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE