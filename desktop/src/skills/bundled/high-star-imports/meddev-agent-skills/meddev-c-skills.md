---
name: meddev-agent-skills
description: | 医疗设备嵌入式 C 开发 Agent Skills（59 个子技能），涵盖 FDA 合规、安全关键系统开发， 对齐 IEC 62304 / ISO 14971 / EU MDR 等医疗器械软件标准。
source: https://github.com/AminAlam/meddev-agent-skills
license: MIT
--- # 医疗设备 C 开发技能集（meddev-agent-skills） 来自 AminAlam/meddev-agent-skills 的 59 个医疗设备软件专项子技能，每个为独立 SKILL.md，
按主题分类。面向 AI 编码 Agent 在医疗器械软件上产出更安全、更合规的代码（不替代人工法规审查）。 ## 子技能分类（59，按主题） | 主题 | 数量 | 内容 |
|------|------|------|
| regulatory | 13 | 法规（IEC 62304 / ISO 14971 / EU MDR） |
| documentation | 11 | 文档（AI 辅助开发治理、变更控制、代码注释） |
| firmware | 7 | 固件（bootloader、SOUP、OTA 等） |
| testing | 7 | 测试（单元/集成/验证） |
| security | 6 | 安全（密钥、威胁建模、隐私） |
| architecture | 5 | 架构（防御性设计、容错、安全分级、状态机、关注点分离） |
| connectivity | 4 | 连接（BLE/USB/WiFi 医疗、互操作） |
| data | 3 | 数据（审计日志、数据完整性、PHI 处理） |
| ci-cd | 3 | CI/CD（自动化测试、流水线设计、发布管理） | ## 使用建议 - 每个 SKILL.md 含 `When to Apply`、模式、反模式、验证清单。
- Agent 集成：遍历仓库索引 `SKILL.md` 路径 + frontmatter；按安全等级/司法辖区/文件类型匹配。
- 本集为机器可读、Agent 友好的合规指引，**不替代人类法规评审**。 > 来源：https://github.com/AminAlam/meddev-agent-skills （MIT，对齐 IEC 62304）
