# Human Future Forecast — Expansion Sessions & Methodology

This file captures the incremental expansion history and source-acquisition patterns for the human-future-forecast skill. Each version entry records what was added, which sources were integrated, and any methodological shifts.

## Version History (detailed)

### v0.1.0 → v0.2.0 (2026-09-15)
- Initial scaffold: 6-layer framework (geopolitics/climate/tech/economics/governance/social-psychology)
- Pivoted to "human evolution"主线：BCI / CRISPR / Longevity / Space / Quantum / AGI / Transhumanism

### v0.2.0 → v0.3.0 (2026-09-15)
- Added HeartFlow full-text gate supervision + per-chapter probing
- Established false-positive taxonomy: dehumanization / ai_writing_tell / moral_foundations / reasoning_coherence

### v0.3.0 → v0.4.0 (2026-09-15)
- New chapters: humanoid robots / digital consciousness / military augmentation / synthetic biology / AI safety governance
- Source count: 83 → 100+

### v0.4.0 → v0.5.0 (2026-09-15)
- Multi-dimensional refinement: BCI pipeline details / CRISPR trial expansions / longevity market data / quantum cryptography singularity独立节
- Source count: 100+ → 130+

### v0.5.0 → v0.6.0 (2026-09-16)
- Quantum expansion: Microsoft Azure Quantum Copilot (2026-10) / Google Willow 105-qubit / Cloudflare post-quantum TLS default on
- Longevity pipeline expansion: Life Biosciences ER-100 (first-in-human partial reprogramming, 2026-06) / Altos Labs $6B / NewLimit $760M / Retro Biosciences $180M / Unity Biotechnology liquidation (industry washout signal)
- Geopolitical risk expansion: Russia-Ukraine NATO escalation / Taiwan Strait GPSRL proximity / AI autonomous weapons (Anduril/Meta AR helmet) / global AI regulatory fragmentation / bioweapons DIY
- AI infrastructure/energy bottleneck: Goldman Sachs $7.6T 2026-2031 capex / Morgan Stanley 145GW by 2028 / power grid as binding constraint / nuclear PPA resurgence (Microsoft/Google/Amazon)
- Social psychology: Frontier Risk Monitor Q1 2026 (METR 7-month capability doubling) / International AI Safety Report 2026 / UN High Commissioner Volker Turk existential warning (2026-09-07)
- Source count: 130+ → 150+

## Source-Acquisition Methodology

### Search Strategy
1. **Batch multi-keyword search**: Each major theme gets 2-4 complementary queries (e.g. "quantum computing roadmap 2027 2028 IBM Google Microsoft" + "post-quantum cryptography deployment 2026")
2. **Source-type diversity**: Academic (PNAS/Nature/arXiv) + Industry (official blogs/PR) + Think tanks (AI 2027/Metaculus/FLI) + News (Reuters/NYT/Atlantic) + Regulatory (EU/NY/IL SB 315)
3. **Real-time news anchoring**: tencent-news / web_search for 2026-09 最新事件（GPT-6 Astra 2026-09-03、Hubinger resignation 2026-09-09、UN Turk warning 2026-09-07）

### Integration Rules
- Only integrate sources with **specific dates / dollar amounts / trial IDs** (avoid vague claims)
- Each new section must pass HeartFlow gate probing (even if full-text gate is noisy)
- When a search returns < 2KB fragmented results, retry with broader query before abandoning
- Patch order: references document first (content) → SKILL.md second (metadata) → git commit together

### Verification
- Full-text gate on v0.6.0: action=rewrite, overallScore=0 (false-positive dominated)
- Per-chapter probe: 7/12 chapters ≥0.77 credible; low-score chapters concentrated in technical/medical/philosophical terminology
- Judgment: retain original text, annotate gate results for user reference

## Known Limitations (next version targets)
- Full-text gate still dominated by technical-term false positives → consider domain-specific lexicon relaxation in future HeartFlow versions
- Social psychology / public opinion section still underdeveloped (only 10+ sources) → needs polling data / longitudinal surveys
- Economic modeling thin: mostly macro capex numbers, missing sectoral employment impact estimates
- China-specific sources underweighted (most Chinese-language sources not captured by English queries)
