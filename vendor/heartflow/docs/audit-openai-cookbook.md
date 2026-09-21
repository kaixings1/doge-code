# HeartFlow Repository Audit — openai/openai-cookbook

**Date:** 2026-09-03 02:47:26
**Auditor:** HeartFlow v6.7.13 (rule-based discriminator, zero external LLM)
**Target:** /tmp/openai-cookbook
**Classification:** Confidential — for repository maintainers only

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| Total files | 3,148 |
| Total source lines | 3,855,360 |
| Python files | 225 |
| JS/TS files | 80 |
| Markdown files | 93 |
| Config files | 238 |
| Secret-like strings | 16 |
| Shell-invocation sites | 22 |
| Path-traversal patterns | 16 |
| Prompt-injection doc strings | 67 |
| CI present | yes |
| Security policy | no |
| License file | LICENSE |

**Overall risk:** Medium

---

## 2. Scope

Static analysis of the repository at /tmp/openai-cookbook.
Covered: Python, JS/TS, Markdown, YAML/JSON.
Excluded: binary assets, vendored dependencies, build outputs.

---

## 3. Findings

### 3.1 Secrets / Credentials
Detected 16 secret-like strings:
1. `examples/GPT_with_vision_for_video_understanding.ipynb`
2. `examples/Generate_Images_With_High_Input_Fidelity.ipynb`
3. `examples/Parse_PDF_docs_for_RAG.ipynb`
4. `examples/Reinforcement_Fine_Tuning.ipynb`
5. `examples/Speech_transcription_methods.ipynb`
6. `examples/agents_sdk/app_assistant_voice_agents.ipynb`
7. `examples/agents_sdk/computer_use_with_daytona/computer_use_with_daytona.ipynb`
8. `examples/codex/using_goals_in_codex.ipynb`
9. `examples/dalle/How_to_create_dynamic_masks_with_DALL-E_and_Segment_Anything.ipynb`
10. `examples/data/marketing_sample_for_amazon_com-ecommerce__20200101_20200131__10k_data.csv`
11. `examples/data/winemag/winemag-data-130k-v2.csv`
12. `examples/gpt4o/introduction_to_gpt4o.ipynb`
13. `examples/multimodal/Using_GPT4_Vision_With_Function_Calling.ipynb`
14. `examples/multimodal/document_and_multimodal_understanding_tips.ipynb`
15. `examples/partners/mcp_powered_voice_agents/mcp_powered_agents_cookbook.ipynb`
16. `examples/partners/temporal_agents_with_knowledge_graphs/temporal_agents.ipynb`

### 3.2 Command Execution
Detected 22 sites:
1. `examples/Fine_tuning_for_function_calling.ipynb`
2. `examples/How_to_combine_GPT4o_with_RAG_Outfit_Assistant.ipynb`
3. `examples/Tag_caption_images_with_GPT4V.ipynb`
4. `examples/agents_sdk/agent_improvement_loop.ipynb`
5. `examples/agents_sdk/building_reliable_agents_memory_compaction.ipynb`
6. `examples/agents_sdk/computer_use_with_daytona/computer_use_with_daytona.ipynb`
7. `examples/agents_sdk/deployment_manager/frontend/src/main.jsx`
8. `examples/agents_sdk/tests/test_security_review_repository_labels.py`
9. `examples/audio/speaker_aware_meeting_intelligence/speaker_aware_meeting_intelligence.ipynb`
10. `examples/chatgpt/gpt_actions_library/gpt_action_box.ipynb`
11. `examples/chatgpt/rag-quickstart/azure/Azure_AI_Search_with_Azure_Functions_and_GPT_Actions_in_ChatGPT.ipynb`
12. `examples/codex/secure_quality_gitlab.md`
13. `examples/evals/realtime_evals/crawl_harness/run_realtime_evals.py`
14. `examples/evals/realtime_evals/walk_harness/run_realtime_evals.py`
15. `examples/fine-tuned_qa/ft_retrieval_augmented_generation_qdrant.ipynb`
16. `examples/gpt-5/gpt-5_frontend.ipynb`
17. `examples/gpt-5/prompt-optimization-cookbook/scripts/topk_eval.py`
18. `examples/object_oriented_agentic_approach/resources/registry/tools/python_code_interpreter_tool.py`
19. `examples/partners/agentic_governance_guide/guardrail_tuner/feedback_loop.py`
20. `examples/partners/eval_driven_system_design/receipt_inspection.ipynb`
... (truncated)

### 3.3 Path Traversal
Detected 16 sites:
1. `examples/Function_calling_with_an_OpenAPI_spec.ipynb`
2. `examples/Multiclass_classification_for_transactions.ipynb`
3. `examples/Reinforcement_Fine_Tuning.ipynb`
4. `examples/audio/speaker_aware_meeting_intelligence/speaker_aware_meeting_intelligence.ipynb`
5. `examples/chatgpt/rag-quickstart/azure/Azure_AI_Search_with_Azure_Functions_and_GPT_Actions_in_ChatGPT.ipynb`
6. `examples/chatgpt/rag-quickstart/gcp/Getting_started_with_bigquery_vector_search_and_openai.ipynb`
7. `examples/data/oai_docs/crawl-website-embeddings.txt`
8. `examples/gpt-5/outputs/snake_game.html`
9. `examples/multimodal/image-gen-1.5-prompting_guide.ipynb`
10. `examples/multimodal/image-gen-models-prompting-guide.ipynb`
11. `examples/partners/AWS/controlled_agentic_commerce_with_agentcore_payments/src/agentic_commerce/agentcore_session.py`
12. `examples/vector_databases/PolarDB/Getting_started_with_PolarDB_and_OpenAI.ipynb`
13. `examples/vector_databases/analyticdb/Getting_started_with_AnalyticDB_and_OpenAI.ipynb`
14. `examples/vector_databases/hologres/Getting_started_with_Hologres_and_OpenAI.ipynb`
15. `examples/vector_databases/neon/neon-postgres-vector-search-pgvector.ipynb`
16. `examples/vector_databases/tair/Getting_started_with_Tair_and_OpenAI.ipynb`

### 3.4 Prompt Injection in Docs / Strings
Detected 67 strings:
1. `AGENTS.md`
2. `articles/gpt-oss/build-your-own-fact-checker-cerebras.ipynb`
3. `articles/gpt-oss/fine-tune-transfomers.ipynb`
4. `articles/gpt-oss/run-colab.ipynb`
5. `articles/openai-harmony.md`
6. `examples/Context_summarization_with_realtime_api.ipynb`
7. `examples/Data-intensive-Realtime-apps.ipynb`
8. `examples/Fine_tuning_for_function_calling.ipynb`
9. `examples/How_to_finetune_chat_models.ipynb`
10. `examples/How_to_use_guardrails.ipynb`
11. `examples/Orchestrating_agents.ipynb`
12. `examples/Prompt_Caching_201.ipynb`
13. `examples/Prompt_migration_guide.ipynb`
14. `examples/Realtime_out_of_band_transcription.ipynb`
15. `examples/Realtime_prompting_guide.ipynb`
16. `examples/Reinforcement_Fine_Tuning.ipynb`
17. `examples/Structured_outputs_multi_agent.ipynb`
18. `examples/agents_sdk/agent_improvement_loop.ipynb`
19. `examples/agents_sdk/app_assistant_voice_agents.ipynb`
20. `examples/agents_sdk/computer_use_with_daytona/computer_use_with_daytona.ipynb`
... (truncated)

### 3.5 Governance
- License: present
- Security policy: missing
- Code of conduct: missing
- Contributing guide: present
- CI/CD: present

---

## 4. Recommendations

1. Review all secret-like strings; rotate any real credentials.
2. Audit shell-invocation sites for untrusted input.
3. Validate all file paths through an allowlist before I/O.
4. Add a SECURITY.md if missing.
5. Consider a follow-up audit with conversation logs / prompt templates for live behavior testing.

---

## 5. Limitations

- This audit is static-only. Runtime behavior, multi-turn agent conversations, and tool-abuse patterns require a live execution trace.
- String-based detection can produce false positives on test fixtures and documentation examples.

---

*Generated by HeartFlow v6.7.13. No external LLM was used in the production of this report.*
