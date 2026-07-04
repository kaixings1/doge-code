---
name: unreal-best-practices
description: "Unreal 最佳实践 — Unreal Engine 5.x 开发综合最佳实践指南"
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

# Unreal Engine 5.x 最佳实践指南

## "先研究"原则

**在实现任何游戏系统之前，始终先调查 Epic 是否提供了更新的、专用构建的系统。** Epic Games 不断引入现代框架来替代临时解决方案。使用最新的推荐系统能带来更好的性能、更简便的网络功能、设计师友好的工作流和未来兼容性。

**工作流：**
1. 确定问题领域（输入、技能、音频、粒子、AI、UI、移动等）
2. 查看下方的[现代系统快速参考](#modern-systems-quick-reference)
3. 如有不确定，搜索 Epic 文档和 UE 公开路线图了解最新系统状态
4. 优先选择生产就绪的现代系统，而非遗留方案
5. 对于实验性系统：在投入前评估其成熟度——在原型中使用，而非发布版本

**为何重要：** Epic 通过行动而非仅靠公告来指示方向。当他们重建第一/三人称模板以使用 GAS 和增强输入，或当 Fortnite 使用 Game Feature Plugins 和 CommonUI 发货时，这就是生态系统走向的最清晰信号。

## 官方文档（始终查阅最新详情）

| 来源 | URL |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 42 MINUTES 52 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE