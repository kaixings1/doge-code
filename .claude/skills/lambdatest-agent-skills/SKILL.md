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

# LambdaTest Agent Skills — 测试自动化注册表（46 项技能）

## 概述

此技能是从 [LambdaTest/agent-skills](https://github.com/LambdaTest/agent-skills) 仓库精选的 46 个生产级测试自动化技能的索引。它教 AI 编码助手如何编写、组织和执行跨每个主要框架和 15+ 编程语言的测试自动化代码。AI 不再是生成通用测试代码，而是成为理解正确项目结构、依赖版本、云端执行、CI/CD 集成和每个框架常见调试模式的高级 QA 自动化架构师。

此技能改编自外部 GitHub 仓库：
- `source_repo: LambdaTest/agent-skills`
- `source_type: community`

## 何时使用此技能

- 需要为任何主要框架编写、搭建或审查测试自动化代码时
- 使用 Selenium、Playwright、Cypress、Jest、pytest、Appium 或任何 46 个支持框架时
- 设置新测试项目并需要正确的项目结构、配置文件和依赖时
- 将测试集成到 CI/CD 管道（GitHub Actions、Jenkins、GitLab CI）时
- 在框架之间迁移测试时（例如 Selenium → Playwright、Puppeteer → Cypress）
- 在 LambdaTest / TestMu AI 等云基础设施上运行测试时
- 用户询问如何编写、调试或扩展自动化测试时

## 工作原理

### 第 1 步：确定框架和语言

确定用户使用的测试框架和编程语言。将其匹配到下面 46 个支持技能之一。每个技能涵盖一个特定框架，带有所适配语言的代码模式。

### 第 2 步：应用正确的技能上下文

从下面的注册表中加载相关的框架技能。每个技能包括：项目设置和依赖、核心代码模式、页面对象或测试工具、云端执行配置、CI/CD 集成、常见问题调试表以及最佳实践检查清单。

### 第 3 步：生成生产级测试代码

使用加载的技能上下文生成遵循真实世界惯例的测试代码——而不是通用样板代码。应用特定于框架和语言的正确导入路径、配置格式、断言库和运行器命令。

### 第 4 步：配置本地或云端执行

如果用户想要在本地运行测试，应用本地运行器配置。如果在 LambdaTest / TestMu AI 云上运行，配置 RemoteWebDriver 能力或适当的云 SDK，并从环境变量设置 `LT_USERNAME` 和 `LT_ACCESS_KEY`——绝不要硬编码凭据。

### 第 5 步：添加 CI/CD 集成

当被要求时，生成一个并行运行测试、上传报告并在失败时捕获工件的 GitHub Actions（或 Jenkins / GitLab CI）工作流。

## 技能注册表

### 🌐 E2E / 浏览器测试 (15 项技能)

| 技能 | 语言 | 描述 |