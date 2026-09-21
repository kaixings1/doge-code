# HeartFlow Gate False Positive Diagnosis — 长文本推演场景专用

> 适用场景：对 200+ 行综合推演/预测/综述类文档做 HeartFlow gate 监督时，区分真问题 vs 技术语言误报。

## 典型模式

详细版（长文本）经常触发 gate.block / 低分，但逐句隔离后 95% 以上触发句为假阳性。

### 高频误报维度及触发语言

| 维度 | 典型触发语言 | 误报根因 |
|---|---|---|
| dehumanization | "professional identity erosion" / "劳动力替代" / "energy demand curve" | 技术/经济预测语言描述真实现象，无人格贬损 |
| contradiction | 全文多场景对比（"A 可行…但 B 更…"） | 跨句语境对比被当成事实矛盾 |
| reasoning_coherence | 段落间因果链较长（>3 跳） | 长文本推理跨度大，非逻辑断裂 |
| bullshit | 概率预测堆叠（"~35% / ~60% / ~70%"） | 数值范围标注被当成模糊话术 |
| moral_foundations | "dignity" / "common good" / "rights" | 哲学/法学论述中的规范性术语被当成道德绑架 |

### 真问题特征（不要误判为假阳性）

- 具体人格群体贬损（"X 族劣等" / "某国人不配"）— 不是描述技术影响
- 明确事实错误（数字/日期/引用与可验证来源直接矛盾）
- 隐藏价值锁定（用情感词掩盖政策偏好，如 " obviously the only moral choice"）

## 诊断 SOP

1. **全本文本 gate 跑分**：记下 action / overallScore / verdict
2. **二分 halves**：前半段 / 后半段分别 gate，看哪一半触发
3. **触发句定位**：对触发半边做 100 行级 chunk gate，缩到最小触发块
4. **单句验证**：把触发句单独喂 gate，若返回 null → 误报
5. **矛盾对搜索**：对 contradiction 维度，grep 具体矛盾词对（"完全可行…当然也可能失败"）
6. **结论**：
   - 单句 null + 全文触发 → 假阳性，保留原文
   - 单句命中 + 语义确有问题 → 真问题，改写或删除

## 工具脚本模板

```javascript
// /tmp/hf-probe-<name>.js
const { HeartFlow } = require('/root/.hermes/skills/ai/mark-heartflow-skill/src/core/heartflow.js');
const hf = new HeartFlow({ dataDir: '/root/.hermes/skills/ai/mark-heartflow-skill/data', silent: true });
hf.start();
setTimeout(async () => {
  const text = fs.readFileSync('/root/.hermes/skills/ai/mark-heartflow-skill/references/<target>.md', 'utf8');
  const r = await hf.think(text);
  console.log(JSON.stringify({ score: r.output.meta.confidence, action: r.output.conclusion }));
}, 3000);
```

变体：
- `hf-probe-block.js`：全文本一次跑
- `hf-probe-halves.js`：前半段 / 后半段隔离
- `hf-probe-dh-first160.js`：只取前 160 行
- `hf-probe-dh-rest.js`：取 161 行到结尾

## 汇报规范

向用户汇报时必须诚实区分：
- **真问题**：改写措辞 / 补充来源 / 删除不确定主张
- **假阳性**：保留原文 + 说明探测结果（几处触发、逐句验证方法）
- **不撒谎**：不要把假阳性说成 "已修复"，不要 massage 文本凑高分

## 本技能中的已知假阳性

`human-future-2026-2028.md` 在 369 行详细版上：
- dehumanization × 3（lines 99/132/161）：均已逐句验证为假阳性
- contradiction × 1：全文 emergent，单句 null
- 122 行精简版得分 0.78 / rewrite（可接受）
- 判断：保留详细版原文，不做无意义改写
