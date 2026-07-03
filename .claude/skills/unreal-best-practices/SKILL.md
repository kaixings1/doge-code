---
name: unreal-best-practices
description: "Unreal Best Practices — Unreal Best Practices 相关功能和最佳实践"
  现代 Unreal Engine 5.x 开发的综合最佳实践指南。
  涵盖 Epic 面向现代系统的战略方向（GAS、Enhanced Input、StateTree、
  MetaSounds、Niagara、PCG、CommonUI、World Partition、Game Feature Plugins、Gameplay Tags），
  "先研究"原则——在实现前始终检查是否有更新的 UE 系统，
  C++ 与 Blueprint 决策、数据驱动设计、资产管理、项目组织、
  命名约定、性能优化以及使用 Unreal Insights 调试。
  当用户询问 UE 最佳实践、现代 UE5 工作流、使用哪个系统、
  新旧 UE 系统对比、推荐方案、项目设置、代码组织、性能
  技巧、Blueprint 与 C++ 决策、命名约定，或开始新功能并需要关于使用哪种 UE 系统的指导时使用。
  当用户询问 Unreal Engine 中是否有更新/更好的方式来做某事，
  或比较传统系统与现代替代方案时也会触发。涵盖已弃用系统及其迁移路径。
---

# Unreal Engine 5.x Best Practices Guide

## The "Research First" Principle

**Before implementing any gameplay system, always investigate whether Epic provides a newer, purpose-built system for it.** Epic Games continuously introduces modern frameworks that replace ad-hoc solutions. Using the latest recommended system yields better performance, easier networking, designer-friendly workflows, and future compatibility.

**Workflow:**
1. Identify the problem domain (input, abilities, audio, particles, AI, UI, movement, etc.)
2. Check the [Modern Systems Quick Reference](#modern-systems-quick-reference) below
3. If uncertain, search Epic's documentation and the UE Public Roadmap for the latest system status
4. Prefer production-ready modern systems over legacy approaches
5. For experimental systems: evaluate maturity before committing -- use them in prototypes, not shipping builds

**Why this matters:** Epic signals their direction through actions, not just announcements. When they rebuild the First/Third Person templates to use GAS and Enhanced Input, or when Fortnite ships with Game Feature Plugins and CommonUI, that is the clearest indicator of where the ecosystem is heading.

## Official Documentation (always consult for latest details)

| Source | URL |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 42 MINUTES 52 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE