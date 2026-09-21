# 心虫 HeartFlow × 国标安全映射表

**版本**: v6.7.0  
**标准依据**: GB/T 42497-2023《信息安全技术 人工智能生成内容安全要求》  
**对照维度**: 6 大关口 × 心虫模块/维度

---

## 国标六大关口 × 心虫实现对照

| 关口 | 国标要求 | 心虫实现 | 状态 |
|------|---------|---------|------|
| **关口 1：生成内容安全** | 生成内容不得有害、违法、歧视、虚假 | `heartflow_think` / `checkOutput` (45维判别) + `discriminate` | ✅ 已覆盖 |
| **关口 2：训练数据安全** | 数据采集需合法、授权、最小必要 | `heartflow_memory_guard` + `data-eraser.js` + memory ACL | ✅ 已覆盖 |
| **关口 3：出域防护** | 向外部发送前必须检查敏感信息 | `heartflow_check_outbound` (gate-outbound.js) | ✅ v6.7.0 新增 |
| **关口 4：算法透明** | 决策可追溯、可解释 | `heartflow_engine_pacing` + `heartflow_self_heal` | ✅ 已覆盖 |
| **关口 5：审计追溯** | 全链路日志 + HMAC完整性验证 | `heartflow_audit_trace` (trace-chain.js) | ✅ v6.7.0 新增 |
| **关口 6：应急处置** | 异常时自动降级 + 紧急终止 | `heartflow_circuit_breaker` (circuit-breaker.js) | ✅ v6.7.0 新增 |

---

## 缺口清单

| 缺口 | 严重程度 | 建议 | 版本 |
|------|---------|------|------|
| `heartflow_think` 长文本走回声缺陷 | 中 | 本地 require 直调 checkOutput | v6.7.x |
| 出域检查需集成到 `safeFetch` 拦截层 | 高 | 将 `checkOutbound` 接入 fetch 前置 | v6.8.0 |
| 熔断需接入 MCP handler 统计流 | 中 | `recordOutcome()` 嵌入 handleTool | v6.8.0 |
| `.well-known/agent-card.json` 静态端点 | 低 | CI 自动生成 + 校验 | v6.8.0 |

---

## 45 维判别 × 国标条款映射（摘要）

| 判别维度 | 对应国标条款 | 严重级别 |
|---------|-------------|---------|
| `factual_consistency` | 虚假内容禁止 | CRITICAL |
| `bias_discrimination` | 歧视内容禁止 | CRITICAL |
| `harmful_content` | 有害内容禁止 | CRITICAL |
| `privacy_leak` | 个人信息保护 | HIGH |
| `indirect_injection` | 提示词注入防御 | HIGH |
| `outbound_gate` | 出域防护 | HIGH |
| `audit_trace` | 审计追溯 | MEDIUM |
| `circuit_breaker` | 应急处置 | MEDIUM |

（完整 45 维度清单见 `references/discriminator-dimensions.md`）

---

## 合规自测清单

- [x] 生成内容安全：45维判别全量测试通过（343 测试用例）
- [x] 训练数据安全：DataEraser + memory ACL 已集成
- [x] **出域防护**：gate-outbound.js + PII 正则（身份证/手机号/合同金额）
- [x] **审计追溯**：trace-chain.js HMAC 链 + WORM append + 16 违规标签
- [x] **应急处置**：circuit-breaker.js 内存/CPU/失败率熔断 + killSwitch
- [ ] `.well-known/agent-card.json`：静态端点未部署（计划 v6.8.0）
- [ ] 26 项互联对标测试：待实施（计划 v7.0.0）

---

*生成时间: 2026-08-27*  
*维护: HeartFlow Owner + AuditGuard*
