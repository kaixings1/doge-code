---
name: embedded-review
description: | 嵌入式/固件项目的专家级代码审查技能，支持双模型交叉审查（Claude + Codex，经 ACP）。 检测内存安全、中断风险、RTOS 陷阱、硬件接口缺陷与 C/C++ 反模式。当用户要求审查 嵌入式/固件/MCU 代码改动、diff 或 PR 时触发。
license: 见原仓库
source: https://github.com/ylongw/embedded-review
--- # 嵌入式代码审查专家（embedded-review） ## 严重级别 | 级别 | 名称 | 说明 | 动作 |
|------|------|------|------|
| **P0** | 严重 | 内存损坏、中断安全违例、安全漏洞、变砖风险 | 必须阻断合并 |
| **P1** | 高 | 竞态、资源泄漏、未定义行为、RTOS 误用 | 合并前应修复 |
| **P2** | 中 | 代码异味、可移植性问题、缺错误处理、次优模式 | 修复或建跟进项 |
| **P3** | 低 | 风格、命名、文档、小建议 | 可选改进 | ## 工作流 ### 模式选择
- **单模型**（默认，diff ≤100 行）：当前会话模型跑一遍，快、省。
- **双模型交叉**（diff >100 行或明确要求）：Claude Code + Codex 各经 ACP 独立审查，交叉比对，质量更高。 用户可覆盖："用双模型 review" / "quick review 就行"。 ### Phase 0：预检 —— 范围与上下文
1. 运行 `scripts/prepare-diff.sh <repo> [diff_range]`，输出仓库信息、目标识别（MCU/RTOS/编译器）、 diff 统计与规模评估（SMALL/MEDIUM/LARGE）、关键路径检测（ISR/DMA、crypto、NFC、boot/OTA）、完整 diff。
2. 据输出选模式：无改动→提示；SMALL→单模型；LARGE(>500)→先按文件/模块汇总再分批；关键路径→总推双模型。
3. 构建审查上下文包：仓库信息、diff 全文、相关 checklist、关注点。 ### Phase 1：单模型审查
依次加载 references 下的检查清单：
1. **内存安全**：栈溢出、缓冲越界、对齐、DMA 缓存一致性、堆碎片；标 `sprintf/strcpy/gets/strcat` 建议改用有界替代。
2. **中断与并发正确性**：共享变量、临界区、ISR 最佳实践、RTOS 陷阱；优先级反转、可重入、嵌套中断。
3. **硬件接口**：外设初始化顺序、寄存器访问、时序违规、引脚冲突；I2C/SPI/UART/NFC 缓冲管理、超时处理。
4. **C/C++ 语言陷阱**：未定义行为、整数问题、编译器假设、链接问题、预处理隐患、可移植性、类型安全。
5. **架构与可维护性**：HAL/BSP 分层、抽象、耦合、可测性；死代码、魔数、配置管理。
6. **安全扫描（嵌入式专属）**：密钥存储、调试接口、固件更新完整性；侧信道、故障注入、输入校验、栈保护。 ### Phase 2：双模型交叉审查（ACP）
为同一上下文构建两个独立任务（Claude 任务 + Codex 任务），并行 `sessions_spawn(runtime="acp", ...)`。
完成后三方比对：
- **共识发现**（两者都标）→ 高置信，真 bug
- **仅 Claude** / **仅 Codex** → 复核有效性，异质视角可能补盲
- **矛盾** → 交人工判断 映射统一严重级别 P0-P3。 ### Phase 3：输出格式
含目标/分支/审查文件数/模式/总评（APPROVE/REQUEST_CHANGES/COMMENT），按 P0-P3 列 findings，
双模型时附交叉分析表（共识/仅Claude/仅Codex/矛盾计数）与硬件时序、架构备注。 ### Phase 4：下一步
列出问题数，让用户选：全修 / 仅 P0-P1 / 指定项 / 改用双模型重审 / 不改。
**重要**：用户明确确认前不实施改动。 ## 资源
- `references/memory-safety.md`：缓冲/栈/堆/DMA/对齐清单
- `references/interrupt-safety.md`：ISR/并发/RTOS/原子操作清单
- `references/hardware-interface.md`：外设/寄存器/时序/协议清单
- `references/c-pitfalls.md`：UB/整数/编译器/预处理/可移植性清单
- `scripts/prepare-diff.sh`：提取 git diff 并构建审查上下文 > 来源：https://github.com/ylongw/embedded-review
