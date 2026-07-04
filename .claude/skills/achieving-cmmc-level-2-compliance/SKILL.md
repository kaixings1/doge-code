---
name: achieving-cmmc-level-2-compliance
description: "实现 CMMC 二级合规 — 为国防承包商环境准备 CMMC 二级认证：界定 CUI 和 FCI 范围，实施 14 个系列的 110 项 NIST SP 800-171 Rev 2 安全要求。"
  适用于以下情况：组织在 DoD 合同下处理受控非机密信息 (CUI)，合同包含 DFARS 条款 252.204-7012/7019/7020/7021，
  准备或响应 CMMC 评估，计算或改进 SPRS 分数，为 800-171 构建系统安全计划或 POA&M，
  或界定哪些系统在 CUI 边界内。关键词：CMMC、CMMC 二级、NIST 800-171、SP 800-171 Rev 2、
  CUI、FCI、SPRS、DFARS 7012、C3PAO、POA&M、系统安全计划、DoD 评估方法、110项控制、
  国防工业基础、DIB、FedRAMP 等效性。
domain: cybersecurity
subdomain: compliance-governance
tags:
- cmmc
- nist-800-171
- cui
- sprs
- dfars
- c3pao
- poam
- compliance
- governance
- defense-industrial-base
version: "1.0"
author: andrewibrah
license: Apache-2.0
nist_csf:
- GV.OC-03
- GV.SC-01
- ID.AM-08
- ID.RA-05
- PR.AA-01
- PR.DS-01
mitre_attack:
- T1078
- T1190
- T1041
- T1048
- T1567
---

# 实现 CMMC 二级合规

## 何时使用

9	- 当**国防工业基础 (DIB)** 中的组织在 DoD 合同下存储、处理或传输**受控非机密信息 (CUI)** 时。
10	- 当合同包含 **DFARS 252.204-7012**（保护/事件报告）、**-7019/-7020**（NIST 800-171 自我评估 + SPRS）或新的 **-7021**（CMMC 要求）时。
11	- 当准备进行 **C3PAO** 第三方评估或 DoD 主导的评估时。
12	- 当必须根据 NIST SP 800-171 DoD 评估方法**计算、发布或改进 SPRS 分数**时。
13	- 当为 110 项要求编写或修复**系统安全计划 (SSP)** 和 **POA&M** 时。
14	- 当**界定**哪些资产在 CUI/FCI 边界内时（CUI 资产、安全保护资产、承包商风险管理资产、范围外）。

## 前提条件

- 了解**哪些合同包含 CUI** 以及涉及的 CUI 类别（检查合同和 DoD CUI 注册表）。
- 资产清单和网络图，以便在评估控制之前定义**CMMC 评估范围**。
- **NIST SP 800-171 Rev 2** 要求和 **DoD 评估方法**评分权重。
- 已记录的 **SSP**（其缺失本身就是一项未满足的要求 — 3.12.4）。
- 识别任何接触 CUI 的**外部服务提供商 (ESP)**/云服务，以及它们是否符合**FedRAMP 中等（或等效）**。

## 工作流程

### 1. 确定适用性和 CUI 类别
确认合同需要 CMMC 二级（存在 CUI，不仅仅是 FCI）。仅 FCI 的合同是**一级**（15 项 FAR 52.204-21 要求）。从合同和 DoD CUI 注册表中识别 CUI 类别。

### 2. 界定环境范围
将每个资产分类到 CMMC 界定类别之一：
- **CUI 资产** — 处理/存储/传输 CUI（在范围内，针对所有适用控制进行评估）。
- **安全保护资产** — 为 CUI 环境提供安全性（在范围内）。
- **承包商风险管理资产** — 可能但无意处理 CUI；通过策略管理。
- **专用资产**（物联网/操作技术、政府提供设备、测试设备）— 已记录，有限评估。
- **范围外** — 物理/逻辑上与 CUI 隔离。

有意最小化范围 — 一个更小、良好分段的 CUI 区域比扁平网络认证成本低得多。

### 3. 实施 110 项要求（NIST SP 800-171 Rev 2）
处理 **14 个系列**（3.1–3.14）。对于每项要求，实施后在 SSP 中编写**实施方式**。高杠杆早期成果：多因素认证 (3.5.3)、FIPS 验证的加密 (3.13.11)、审计日志记录 (3.3.x)、访问控制 + 最小权限 (3.1.x) 和事件响应 (3.6.x)。

### 4. 使用 DoD 评估方法 (SPRS) 评分
从 **110** 开始，减去每项**未满足**要求的加权值（**1、3 或 5 分**）；少量控制适用部分学分（例如，多因素认证、FIPS 加密）。结果是 **SPRS 分数**（最高 110；方法下限为 −203）。将分数、SSP 日期和评估范围发布到 **SPRS**（或更高级评估的 eMASS）。

### 5. 构建合规的 POA&M
记录每项未满足的要求，包括负责人、修复措施和里程碑。**CMMC 规则下的约束：** **条件**状态需要至少 **80%** 的分数（≥ 110 项中的 88 项），只有**符合 POA&M 资格**的要求可以延期（最高权重的安全要求必须完全满足 — 根据 32 CFR 第 170 部分验证资格），所有 POA&M 项目必须在 **180 天内关闭**以将条件状态转换为**最终**。

### 6. 评估（自我或 C3PAO）
- **一级**和二级子集 = 年度**自我评估**，并在 SPRS 中确认。
- **二级（大多数 CUI 合同）** = 三年一次的 **C3PAO** 认证评估。
- **三级** = DoD (DIBCAC) 在二级基础上进行的评估，增加 SP 800-172 增强要求。
评估员根据证据（检查/访谈/测试）将每个目标评估为**满足/不满足/不适用**。高级官员提交持续合规的**年度确认**。

### 7. 维护认证
认证有效期为**三年**，需要**年度确认**。维护 SSP，变更时重新评分，保持证据最新，并将重大变更反馈到评估中。

## 关键概念

| Concept | Definition |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 12 MINUTES 26 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE