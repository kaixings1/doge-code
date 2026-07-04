---
name: adaptyv
author: "K-Dense, Inc."
description: "如何使用 Adaptyv Bio Foundry API 和 Python SDK 进行蛋白质实验设计、提交和结果检索。当用户提到 Adaptyv、Foundry API、蛋白质结合实验、蛋白质筛选实验、BLI/SPR 实验、热稳定性实验或想要提交蛋白质序列进行实验表征时使用此技能。当代码导入 adaptyv、adaptyv_sdk 或 FoundryClient，或引用 foundry-api-public.adaptyvbio.com 时也触发。"
license: MIT
compatibility: 需要 Python 3.10+, an Adaptyv Foundry account, and an API key from foundry.adaptyvbio.com. Install adaptyv-sdk from GitHub with uv pip install.
metadata: {"version": "1.2", "skill-author": "K-Dense Inc."}
---

# Adaptyv Bio Foundry API

Adaptyv Bio 是一个将蛋白质序列转化为实验数据的云实验室。用户通过 API 或 UI 提交氨基酸序列；Adaptyv 的自动化实验室运行测定（结合、热稳定性、表达、荧光）并在约 21 天内交付结果。

**官方文档:** [docs.adaptyvbio.com/api-reference](https://docs.adaptyvbio.com/api-reference) · [llms.txt 索引](https://docs.adaptyvbio.com/llms.txt) · [OpenAPI 规范](https://foundry-api-public.adaptyvbio.com/api/v1/openapi.json)

## 快速开始

**基础 URL:** `https://foundry-api-public.adaptyvbio.com/api/v1`

**认证:** `Authorization` 头中的 Bearer 令牌。令牌从 [foundry.adaptyvbio.com](https://foundry.adaptyvbio.com/) 侧边栏获取。

编写代码时，始终从环境变量 `ADAPTYV_API_KEY` 或 `.env` 文件读取 API 密钥 — 切勿硬编码令牌。首先检查项目根目录中是否存在 `.env` 文件；如果存在，使用 `python-dotenv` 等库加载它。

[官方 API 文档](https://docs.adaptyvbio.com/api-reference/api-introduction) 在 curl 示例中使用 `FOUNDRY_API_TOKEN`；这是相同的 bearer 令牌 — 在 Python 和新 shell 脚本中优先使用 `ADAPTYV_API_KEY` 以与 SDK 保持一致。

```bash
export ADAPTYV_API_KEY="abs0_..."
curl https://foundry-api-public.adaptyvbio.com/api/v1/targets?limit=3 \
  -H "Authorization: Bearer $ADAPTYV_API_KEY"
```

除了 `GET /openapi.json` 之外，每个请求都需要认证。将令牌存储在环境变量或 `.env` 文件中 — 切勿将它们提交到源代码控制。

## Python SDK

**版本说明:** `adaptyv-sdk` **0.1.0** (beta) 尚未在 PyPI 上发布 — 从 GitHub 安装：

```bash
uv pip install "git+https://github.com/adaptyvbio/adaptyv-sdk.git"
```

在具有 `pyproject.toml` 的项目中：

```bash
uv add "adaptyv-sdk @ git+https://github.com/adaptyvbio/adaptyv-sdk.git"
```

**环境变量**（在 shell 或 `.env` 文件中设置）：

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

| Type | Method | Measures | 需要 Target |