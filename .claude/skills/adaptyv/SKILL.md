---
name: adaptyv
author: "K-Dense, Inc."
description: "如何使用 Adaptyv Bio Foundry API 和 Python SDK 进行蛋白质实验设计、提交和结果检索。当用户提到 Adaptyv、Foundry API、蛋白质结合实验、蛋白质筛选实验、BLI/SPR 实验、热稳定性实验或想要提交蛋白质序列进行实验表征时使用此技能。当代码导入 adaptyv、adaptyv_sdk 或 FoundryClient，或引用 foundry-api-public.adaptyvbio.com 时也触发。"
license: MIT
compatibility: Requires Python 3.10+, an Adaptyv Foundry account, and an API key from foundry.adaptyvbio.com. Install adaptyv-sdk from GitHub with uv pip install.
metadata: {"version": "1.2", "skill-author": "K-Dense Inc."}
---

# Adaptyv Bio Foundry API

Adaptyv Bio is a cloud lab that turns protein sequences into experimental data. Users submit amino acid sequences via API or UI; Adaptyv's automated lab runs assays (binding, thermostability, expression, fluorescence) and delivers results in ~21 days.

**Official docs:** [docs.adaptyvbio.com/api-reference](https://docs.adaptyvbio.com/api-reference) · [llms.txt index](https://docs.adaptyvbio.com/llms.txt) · [OpenAPI spec](https://foundry-api-public.adaptyvbio.com/api/v1/openapi.json)

## Quick Start

**Base URL:** `https://foundry-api-public.adaptyvbio.com/api/v1`

**Authentication:** Bearer token in the `Authorization` header. Tokens are obtained from [foundry.adaptyvbio.com](https://foundry.adaptyvbio.com/) sidebar.

When writing code, always read the API key from the environment variable `ADAPTYV_API_KEY` or from a `.env` file — never hardcode tokens. Check for a `.env` file in the project root first; if one exists, use a library like `python-dotenv` to load it.

The [official API docs](https://docs.adaptyvbio.com/api-reference/api-introduction) use `FOUNDRY_API_TOKEN` in curl examples; that is the same bearer token — prefer `ADAPTYV_API_KEY` in Python and new shell scripts for consistency with the SDK.

```bash
export ADAPTYV_API_KEY="abs0_..."
curl https://foundry-api-public.adaptyvbio.com/api/v1/targets?limit=3 \
  -H "Authorization: Bearer $ADAPTYV_API_KEY"
```

Every request except `GET /openapi.json` requires authentication. Store tokens in environment variables or `.env` files — never commit them to source control.

## Python SDK

**Version note:** `adaptyv-sdk` **0.1.0** (beta) is not yet on PyPI — install from GitHub:

```bash
uv pip install "git+https://github.com/adaptyvbio/adaptyv-sdk.git"
```

In a project with `pyproject.toml`:

```bash
uv add "adaptyv-sdk @ git+https://github.com/adaptyvbio/adaptyv-sdk.git"
```

**Environment variables** (set in shell or `.env` file):

```bash
ADAPTYV_API_KEY=your_api_key
ADAPTYV_API_URL=https://foundry-api-public.adaptyvbio.com/api/v1
ADAPTYV_ORGANIZATION_ID=your_org_id  # optional
```

The `@lab.experiment` decorator and `FoundryClient` both read `ADAPTYV_API_KEY` and `ADAPTYV_API_URL` from the environment when not passed explicitly.

### Decorator Pattern

```python
from adaptyv import lab

@lab.experiment(target="PD-L1", experiment_type="screening", method="bli")
def design_binders():
    return {"design_a": "MVKVGVNG...", "design_b": "MKVLVAG..."}

result = design_binders()
print(f"Experiment: {result.experiment_url}")
```

### Client Pattern

```python
import os
from adaptyv import FoundryClient

client = FoundryClient(
    api_key=os.environ["ADAPTYV_API_KEY"],
    base_url=os.environ.get(
        "ADAPTYV_API_URL",
        "https://foundry-api-public.adaptyvbio.com/api/v1",
    ),
)

# Browse targets
targets = client.targets.list(search="EGFR", selfservice_only=True)

# Estimate cost
estimate = client.experiments.cost_estimate({
    "experiment_spec": {
        "experiment_type": "screening",
        "method": "bli",
        "target_id": "target-uuid",
        "sequences": {"seq1": "EVQLVESGGGLVQ..."},
        "n_replicates": 3
    }
})

# Create and submit
exp = client.experiments.create({...})
client.experiments.submit(exp.experiment_id)

# Later: retrieve results
results = client.experiments.get_results(exp.experiment_id)
```

## Experiment Types

| Type | Method | Measures | Requires Target |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 12 MINUTES 20 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE