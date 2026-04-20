#!/usr/bin/env python3
"""
统一多后端大模型代理服务
支持 NVIDIA NIM、ModelScope、智谱AI (Zhipu)，可轻松扩展其他 OpenAI 兼容后端
提供 OpenAI 和 Anthropic 格式接口，自动 fallback，支持流式与工具调用
包含请求计数与 Token 统计，启动时可选择清零
新增：数据包监控日志（中文），智谱后端集成
"""

import os
import json
import asyncio
import logging
import time
from typing import Optional, List, Dict, Any, Tuple

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
import uuid

# ================== 全局配置 ==================
VERBOSE_LOG = True          # 是否打印详细日志
PACKET_LOG = True           # 是否打印原始数据包（请求/响应内容）
DEFAULT_TIMEOUT = 480.0     # 总请求超时（秒）
MODEL_SWITCH_DELAY = 2 #0 #3      # 切换模型前的等待秒数（避免速率限制）
COUNTER_FILE = "usage_stats.json"  # 统计文件

# ================== 后端配置 ==================
# 每个后端包含：
#   name: 标识名称
#   base_url: API 基础地址
#   api_key: 认证密钥（支持环境变量占位，如 ${ENV_VAR}）
#   models: 该后端支持的模型列表（用于 /v1/models 汇总）
#   match_prefix: 可选，用于根据模型名前缀自动选择后端

BACKENDS = [
    # 本地动脑模型（普通对话）
    {
        "name": "brain",
        "base_url": "http://127.0.0.1:8081/v1",   # llama-server
        "api_key": "dummy",
        "models": [
            "qwen2.5-coder:3b",           # 小模型，速度快
            "qwen2.5-coder-3b-instruct",            # 长上下文模型
        ],
        "match_prefix": ["brain/"]        # 可通过 "brain/模型名" 显式调用
    },
    # 本地动手模型（工具调用）
    {
        "name": "hands",
        "base_url": "http://127.0.0.1:8080/v1",   # LM Studio
        "api_key": "dummy",
        "models": [
            "qwen2.5-coder-3b-instruct",           # 工具调用推荐使用 coder 模型
            "qwen2.5-coder:3b",
        ],
        "match_prefix": ["hands/"]        # 可通过 "hands/模型名" 显式调用
    },
    {
        "name": "modelscope",
       "base_url": "https://api-inference.modelscope.cn/v1",
        #"base_url": "http://127.0.0.1:8080/v1",
        #"base_url": "http://127.0.0.1:11434/v1",
        "api_key": "ms-e0186609-9d27-4542-a733-4cf18b89c9dd",  # 请替换为你的实际 API Key
        "models": [
            #"qwen9b",                                 # Qwen 系列，支持
            #"deepseek-ai/DeepSeek-V3.2",
            #"1111qwen3.5:4b-120k",           # 专用工具调用模型
            #"Qwen3.5-9B-Q4_K_M",       # 通用大模型（用于普通对话）
            "Qwen/Qwen3.5-397B-A17B",
            "granite3-dense:2b",
            "qwen2.5-coder:1.5b",
            "qwen2.5-coder-3b-instruct",
            "Qwen/Qwen3-32B",
            "Qwen/Qwen3-4B",
            "Qwen/Qwen3-Coder-480B-A35B-Instruct",
            "deepseek-ai/DeepSeek-R1-0528",
            "ZhipuAI/GLM-5",
            "Qwen/Qwen2.5-72B-Instruct",
            "MiniMax/MiniMax-M2.5",
            "Qwen/Qwen3.5-35B-A3B",
            "Qwen/Qwen3.5-27B",
            "ZhipuAI/glm-4-9b-chat",
            "ZhipuAI/GLM-4.7-Flash",
        ],
        "match_prefix": ["modelscope/", "ms/"]
    },
    {
        "name": "nvidia",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "api_key": os.environ.get("NVIDIA_API_KEY", ""),
        "models": [
            "minimaxai/minimax-m2.7",
            "tiiuae/falcon3-7b-instruct",
            "z-ai/glm4.7",
            "qwen/qwen3-coder-480b-a35b-instruct",
            "mistralai/devstral-2-123b-instruct-2512",
            "moonshotai/kimi-k2-instruct-0905",
            "moonshotai/kimi-k2-instruct",
            "qwen/qwen3.5-397b-a17b",
            "deepseek-ai/deepseek-v3.2",
            "meta/llama-3.3-70b-instruct",
            "meta/llama-3.1-8b-instruct",
            "mistralai/mistral-large-3-675b-instruct-2512",
            "qwen/qwen3-32b",
            "qwen/qwen3-8b",
            "google/gemma-2-9b-it",
        ],
        "match_prefix": ["nvidia/", "nim/"]  # 如果模型名以此开头，则路由到此后端
    },
    {
        "name": "zhipu",
        "base_url": "https://open.bigmodel.cn/api/paas/v4/",  # 修复多余的斜杠
        "api_key": "c8926ece36e34b518c28766b44ed718a.afnycznebRuAU2yw",  # 请替换为你的实际API Key
        "models": [
            "glm-4-flash",
            "glm-4.5-flash",
            "glm-4.7-flash",
            "glm-4-air",
            "glm-4.5-air",
            "glm-4.5-airx",
            "glm-4-plus",
            "glm-4.5-plus",
            "glm-4.7",
        ],
        "match_prefix": ["zhipu/", "glm/", "智谱/"]
    },
    # ----------------------------------------
]

    # ---------- 新增：智谱AI后端 ----------] 
# 模型名替换映射：当请求的模型在后端不存在时，映射到指定模型
MODEL_FALLBACK_MAP = {
    #"claude-haiku-4-5-20251001": "qwen2.5-coder-3b-instruct",
    "claude-haiku-4-5-20251001": "Qwen/Qwen3.5-397B-A17B",
    #"qwen2.5-coder-3b-instruct": "Qwen/Qwen3.5-397B-A17B",
    "qwen2.5-coder-3b-instruct": "Qwen/Qwen3.5-397B-A17B"
}

# 默认后端（当无法匹配时使用）
DEFAULT_BACKEND = "brain"

# ================== 统计计数器 ==================
counter_lock = asyncio.Lock()
stats = {
    "success": 0,
    "failed": 0,
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_requests": 0
}
def deep_remove_key(obj, key_to_remove):
    """递归删除字典或列表中指定键的所有出现"""
    if isinstance(obj, dict):
        # 删除当前层的键
        if key_to_remove in obj:
            del obj[key_to_remove]
        # 递归处理值
        for value in obj.values():
            deep_remove_key(value, key_to_remove)
    elif isinstance(obj, list):
        for item in obj:
            deep_remove_key(item, key_to_remove)
def intercept_classifier(request_body: dict) -> bool:
    """
    检测请求是否为分类器调用（system 消息中包含 "conversation state classifier"）
    返回 True 表示需要拦截并直接返回分类结果。
    """
    # 方法1：检测 system prompt 中的关键词
    # 检查 system prompt 内容
    for msg in request_body.get("messages", []):
        if msg.get("role") == "system":
            content = msg.get("content", "")
            if isinstance(content, list):
                text = " ".join(c.get("text", "") for c in content if c.get("type") == "text")
            else:
                text = str(content)
            if "conversation state classifier" in text:
                return True
    # 检查模型名（分类器专用 haiku）
    if "haiku" in request_body.get("model", "").lower():
        return True
    return False

def clean_response_text(text: str) -> str:
    """移除模型返回中的特殊标记，如 <|im_end|>"""
    if text is None:
        return ""
    if not isinstance(text, str):
        return text
    
    text = text.replace("\x00", "")
    text = text.replace("<|im_end|>", "")
    text = text.strip()
    TOKENS_TO_REMOVE = ["<|im_end|>" , "<|im_start|>","<|endoftext|>"]     # 
    for token in TOKENS_TO_REMOVE:
        text = text.replace(token, "")
     
    return text

def load_stats():
    if os.path.exists(COUNTER_FILE):
        try:
            with open(COUNTER_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # 兼容旧格式
                if "success" not in data:
                    data["success"] = data.get("total_requests", 0)
                    data["failed"] = 0
                    data["prompt_tokens"] = 0
                    data["completion_tokens"] = 0
                return data
        except:
            pass
    return stats.copy()

def save_stats(s):
    s["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
    with open(COUNTER_FILE, 'w', encoding='utf-8') as f:
        json.dump(s, f, indent=2, ensure_ascii=False)

async def update_stats(success=True, prompt_tokens=0, completion_tokens=0):
    global stats
    async with counter_lock:
        if success:
            stats["success"] += 1
            stats["prompt_tokens"] += prompt_tokens
            stats["completion_tokens"] += completion_tokens
        else:
            stats["failed"] += 1
        stats["total_requests"] = stats["success"] + stats["failed"]
        save_stats(stats)
        logger.info(f"📊 统计: 成功={stats['success']}, 失败={stats['failed']}, "
                    f"发送Token={stats['prompt_tokens']}, 接收Token={stats['completion_tokens']}")

def startup_interaction():
    global stats
    loaded = load_stats()
    stats.update(loaded)
    print(f"\n📊 当前累计统计:")
    print(f"   ✅ 成功调用: {stats['success']} 次")
    print(f"   ❌ 失败调用: {stats['failed']} 次")
    print(f"   📤 总发送 Token: {stats['prompt_tokens']}")
    print(f"   📥 总接收 Token: {stats['completion_tokens']}")
    #choice = input("是否将计数器清零？(y/n): ").strip().lower()
    #if choice == 'y':
    #    stats = {"success": 0, "failed": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_requests": 0}
    #    save_stats(stats)
    #    print("✅ 计数器已清零。")
    #else:
    #    print("✅ 继续累计计数。")
    print("=" * 50)

# ================== 日志初始化 ==================
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("Log")
if VERBOSE_LOG:
    logging.getLogger("httpx").setLevel(logging.INFO)

app = FastAPI(title="Unified Multi-Backend LLM Proxy")
client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT)

# ================== 辅助函数 ==================
def mask_api_key(key: str) -> str:
    if len(key) > 8:
        return key[:4] + "****" + key[-4:]
    return "***"

def truncate_text(text: str, max_len: int = 5000) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len] + f"...[已截断，总长度 {len(text)} 字符]"

def pretty_print_messages(messages: List[Dict]) -> str:
    if not VERBOSE_LOG or not messages:
        return ""
    lines = []
    for msg in messages:
        role = msg.get("role", "unknown")
        content = msg.get("content")
        if content is None:
            content = ""
        elif isinstance(content, list):
            texts = [c.get("text", "") for c in content if c.get("type") == "text"]
            content = " ".join(texts)
        lines.append(f"  {role}: {truncate_text(str(content), 3000)}")
    return "\n".join(lines)

def log_packet(direction: str, data: Any, is_stream: bool = False):
    """打印数据包详情（中文）"""
    if not PACKET_LOG:
        return
    separator = "=" * 60
    if direction == "request":
        print(f"\n{separator}")
        print(f"📤 【发送请求包】")
        if isinstance(data, dict):
            # 避免打印过长的内容，但保留关键信息
            data_copy = data.copy()
            if "messages" in data_copy:
                msg_preview = []
                for m in data_copy["messages"]:
                    role = m.get("role", "")
                    content = m.get("content", "")
                    if isinstance(content, str):
                        preview = content[:200] + ("..." if len(content) > 200 else "")
                    else:
                        preview = str(content)[:200]
                    msg_preview.append(f"{role}: {preview}")
                data_copy["messages_preview"] = msg_preview
                del data_copy["messages"]
            print(json.dumps(data_copy, indent=2, ensure_ascii=False))
        else:
            print(truncate_text(str(data), 2000))
        print(f"{separator}\n")
    elif direction == "response":
        print(f"\n{separator}")
        print(f"📥 【收到响应包】")
        if is_stream:
            print("（流式响应，仅显示元数据）")
        if isinstance(data, dict):
            # 截断长文本
            if "choices" in data:
                for choice in data["choices"]:
                    if "message" in choice and "content" in choice["message"]:
                        choice["message"]["content"] = truncate_text(choice["message"]["content"], 5000)
            print(json.dumps(data, indent=2, ensure_ascii=False))
        else:
            print(truncate_text(str(data), 2000))
        print(f"{separator}\n")

async def request_with_retry(method: str, url: str, headers: dict, json_data: dict = None, max_retries=3) -> httpx.Response:
    headers_safe = {k: mask_api_key(v) if k.lower() == "authorization" else v for k, v in headers.items()}
    logger.info(f"📡 请求: {method} {url} | 请求头: {headers_safe}")
    safe_data = None
    if json_data:
        # 深拷贝一份，避免影响原始数据
        safe_data = json.loads(json.dumps(json_data))
        # 删除 grammar 字段（如果存在）
        safe_data.pop("grammar", None)
        deep_remove_key(safe_data, "grammar")
        body_str = json.dumps(json_data, ensure_ascii=False)
        logger.info(f"📦 请求体: {truncate_text(body_str, 2000)}")
        log_packet("request", json_data)
        if "11434" in url or "8081" in url or "1234" in url:
            safe_data.pop("frequency_penalty", None)
            safe_data.pop("presence_penalty", None)
    else:
        safe_data = None
    headers_safe = {k: mask_api_key(v) if k.lower() == "authorization" else v for k, v in headers.items()}
    logger.info(f"📡 请求: {method} {url} | 请求头: {headers_safe}")
    if safe_data:
        body_str = json.dumps(safe_data, ensure_ascii=False)
        logger.info(f"📦 请求体: {truncate_text(body_str, 2000)}")
        log_packet("request", safe_data)
    for attempt in range(max_retries):
        resp = await client.request(method, url, headers=headers, json=safe_data)
        logger.info(f"📡 响应状态: {resp.status_code}")
        if resp.status_code == 429:
            wait = 2 ** attempt
            logger.warning(f"⏳ 速率限制 (429)，{wait}秒后重试...")
            await asyncio.sleep(wait)
            continue
        if resp.status_code >= 400:
            error_text = await resp.aread()
            logger.error(f"❌ 错误响应体: {error_text.decode()}")
        resp.raise_for_status()
        # 非流式响应记录数据包
        if not json_data.get("stream", False):
            try:
                resp_data = resp.json()
                log_packet("response", resp_data)
            except:
                pass
        return resp
    raise Exception("超过最大重试次数 (429)")

def get_backend_for_model(model_name: str) -> Tuple[Dict, str]:
    """
    根据模型名选择后端，返回 (backend_config, actual_model_name)
    如果模型名包含前缀（如 'nvidia/llama-3'），则去除前缀并选择对应后端
    """
    # 1. 前缀匹配
    for backend in BACKENDS:
        for prefix in backend.get("match_prefix", []):
            if model_name.startswith(prefix):
                actual_model = model_name[len(prefix):]
                logger.info(f"🔀 前缀匹配: 使用后端 '{backend['name']}'，模型名 '{actual_model}'")
                return backend, actual_model

    # 2. 如果模型名包含 '/'，但未被任何前缀匹配，说明是无效前缀，直接使用默认后端
    if '/' in model_name:
        for backend in BACKENDS:
            if backend["name"] == DEFAULT_BACKEND:
                logger.info(f"🔀 无效前缀，使用默认后端 '{DEFAULT_BACKEND}'，模型 '{model_name}'")
                return backend, model_name
        # 保底
        return BACKENDS[0], model_name

    # 3. 精确匹配（模型名不包含 '/'）
    for backend in BACKENDS:
        if model_name in backend["models"]:
            logger.info(f"🔀 精确匹配: 使用后端 '{backend['name']}'，模型 '{model_name}'")
            return backend, model_name

    # 4. 默认后端
    for backend in BACKENDS:
        if backend["name"] == DEFAULT_BACKEND:
            logger.info(f"🔀 未匹配，使用默认后端 '{DEFAULT_BACKEND}'，模型 '{model_name}'")
            return backend, model_name
    # 保底：第一个后端
    logger.warning(f"⚠️ 无默认后端，使用第一个后端 '{BACKENDS[0]['name']}'")
    return BACKENDS[0], model_name

def build_models_to_try(backend: Dict, requested_model: str) -> List[str]:
    """
    为指定后端构造 fallback 模型列表（请求模型优先，然后是后端列表去重）
    若请求的模型不在后端支持列表中，则根据映射表替换。
    """
    # 检查是否需要替换
    effective_model = requested_model
    if requested_model not in backend["models"]:
        mapped = MODEL_FALLBACK_MAP.get(requested_model)
        if mapped:
            logger.info(f"🔄 模型映射: '{requested_model}' -> '{mapped}'")
            effective_model = mapped
        else:
            logger.warning(f"⚠️ 模型 '{requested_model}' 不在后端支持列表中，且无映射定义。")

    models = []
    if effective_model not in backend["models"]:
        models.append(effective_model)
    else:
        models.append(effective_model)
    models.extend([m for m in backend["models"] if m != effective_model])
    seen = set()
    unique = []
    for m in models:
        if m not in seen:
            seen.add(m)
            unique.append(m)
    return unique

# ================== 中间件 ==================
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"🌐 收到请求: {request.method} {request.url.path}")
    start = time.time()
    response = await call_next(request)
    elapsed = time.time() - start
    logger.info(f"✅ 响应: {response.status_code} 耗时 {elapsed:.3f}秒")
    return response

# ================== 模型列表接口 ==================
@app.get("/v1/models")
async def list_models():
    all_models = []
    for backend in BACKENDS:
        for m in backend["models"]:
            all_models.append({
                "id": f"{backend['name']}/{m}" if backend['name'] != DEFAULT_BACKEND else m,
                "object": "model",
                "created": 1677610602,
                "owned_by": backend["name"]
            })
    return {"object": "list", "data": all_models}

# ================== OpenAI 兼容端点 ==================
@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    try:
        body = await request.json()
        body.pop("grammar", None)
        deep_remove_key(body, "grammar")
        logger.info(f"📨 收到 /v1/chat/completions, stream={body.get('stream')}")
        if VERBOSE_LOG and "messages" in body:
            logger.info("📥 输入消息:\n" + pretty_print_messages(body["messages"]))
    except Exception as e:
        logger.error(f"❌ 无效JSON: {e}")
        return JSONResponse({"error": f"Invalid JSON: {str(e)}"}, status_code=400)

    requested_model = body.get("model", "")
    backend, actual_model = get_backend_for_model(requested_model)
    models_to_try = build_models_to_try(backend, actual_model)
    logger.info(f"🎯 后端: {backend['name']}, 待尝试模型列表: {models_to_try}")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {backend['api_key']}"
    }

    # 智谱后端特殊处理：确保thinking参数被传递（用户可在请求体中指定）
    # 注意：智谱API要求base_url后跟/chat/completions，我们在构建URL时已处理

    # 非流式
    if not body.get("stream", False):
        last_exception = None
        for idx, model_name in enumerate(models_to_try):
            body["model"] = model_name
            #body.setdefault("frequency_penalty", 0.5)
            #body.setdefault("presence_penalty", 0.2)
            logger.info(f"🚀 尝试非流式模型 {model_name} ({idx+1}/{len(models_to_try)})")
            try:
                resp = await request_with_retry(
                    "POST",
                    f"{backend['base_url']}/chat/completions",
                    headers=headers,
                    json_data=body      # 修正：使用 body 而非 payload
                )
                # ----- 自适应解析：处理某些后端在 stream=False 时仍返回流式数据的情况 -----
                content_bytes = await resp.aread()
                content_text = content_bytes.decode('utf-8', errors='ignore').strip()
                if not content_text:
                    raise Exception("后端返回空响应")
                # 如果响应以 "data: " 开头，说明后端错误地返回了 SSE 流式数据
                if content_text.startswith('data: '):
                    logger.warning("⚠️ 后端在非流式请求下返回了 SSE 流式数据，正在合并...")
                    full_text = ""
                    tool_calls = []
                    usage = {}
                    for line in content_text.split('\n'):
                        if line.startswith('data: '):
                            chunk_str = line[6:]
                            if chunk_str == '[DONE]':
                                continue
                            try:
                                chunk = json.loads(chunk_str)
                            except:
                                continue
                            if "usage" in chunk:
                                usage = chunk["usage"]
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            if "content" in delta and delta["content"]:
                                full_text += delta["content"]
                            if "tool_calls" in delta:
                                for tc in delta["tool_calls"]:
                                    idx = tc.get("index", 0)
                                    while len(tool_calls) <= idx:
                                        tool_calls.append({"id": "", "function": {"name": "", "arguments": ""}})
                                    if "id" in tc:
                                        tool_calls[idx]["id"] = tc["id"]
                                    if "function" in tc:
                                        if "name" in tc["function"]:
                                            tool_calls[idx]["function"]["name"] = tc["function"]["name"]
                                        if "arguments" in tc["function"]:
                                            tool_calls[idx]["function"]["arguments"] += tc["function"]["arguments"]
                    # 构造与正常非流式响应一致的数据结构
                    data = {
                        "choices": [{
                            "message": {
                                "content": full_text,
                                "tool_calls": tool_calls if tool_calls else None
                            }
                        }],
                        "usage": usage
                    }
                else:
                    try:
                        data = json.loads(content_text)
                    except json.JSONDecodeError as e:
                        logger.error(f"❌ JSON解析失败，原始响应前300字符: {content_text[:300]}")
                        raise Exception(f"后端返回非JSON数据: {content_text[:200]}")
                # ----------------------------------------------------------------------
                if "error" in data:
                    error_msg = data["error"].get("message", str(data["error"]))
                    logger.error(f"❌ 后端返回错误(200内): {error_msg}")
                    raise Exception(f"Backend error: {error_msg}")

                if "choices" in data:
                    for choice in data["choices"]:
                        if "message" in choice and "content" in choice["message"]:
                            choice["message"]["content"] = clean_response_text(choice["message"]["content"])
                usage = data.get("usage", {})
                await update_stats(
                    success=True,
                    prompt_tokens=usage.get("prompt_tokens", 0),
                    completion_tokens=usage.get("completion_tokens", 0)
                )
                log_packet("response", data)
                return JSONResponse(content=data)
            except Exception as e:
                logger.warning(f"⚠️ 模型 {model_name} 失败: {e}")
                last_exception = e
                await asyncio.sleep(MODEL_SWITCH_DELAY)
                continue

        await update_stats(success=False)
        return JSONResponse({"error": f"所有模型均失败。最后错误: {last_exception}"}, status_code=500)

    # 流式
    async def stream_generator():
        last_error = None
        for idx, model_name in enumerate(models_to_try):
            body["model"] = model_name
            # 添加重复惩罚
            #body.setdefault("frequency_penalty", 0.5)
            #body.setdefault("presence_penalty", 0.2)
            logger.info(f"🌊 尝试流式模型 {model_name} ({idx+1}/{len(models_to_try)})")
            try:
                await asyncio.sleep(MODEL_SWITCH_DELAY)
                async with client.stream(
                    "POST",
                    f"{backend['base_url']}/chat/completions",
                    headers=headers,
                    json=body
                ) as resp:
                    if resp.status_code != 200:
                        error_body = await resp.aread()
                        error_msg = error_body.decode()
                        logger.error(f"❌ 模型 {model_name} 错误 {resp.status_code}: {error_msg}")
                        if resp.status_code == 429:
                            last_error = error_msg
                            continue
                        yield f"data: {json.dumps({'error': {'message': error_msg}})}\n\n".encode()
                        yield b"data: [DONE]\n\n"
                        return

                    usage_info = None
                    logger.info(f"📡 开始接收流式数据...")
                    first_chunk_logged = False
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            yield b"data: [DONE]\n\n"
                            break

                        try:
                            chunk = json.loads(data_str)
                            if not first_chunk_logged:
                                logger.info(f"📦 收到首个数据块 (预览): {truncate_text(data_str, 3000)}")
                                first_chunk_logged = True
                            if "error" in chunk:
                                raise Exception(chunk["error"].get("message", "Unknown error"))
                            if "usage" in chunk:
                                usage_info = chunk["usage"]
                            if "choices" in chunk:
                                for choice in chunk["choices"]:
                                    if "delta" in choice and "content" in choice["delta"]:
                                        choice["delta"]["content"] = clean_response_text(choice["delta"]["content"])
                            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n".encode()
                        except json.JSONDecodeError:
                            logger.warning(f"⚠️ 无法解析块: {data_str}")
                            continue

                    if usage_info:
                        await update_stats(
                            success=True,
                            prompt_tokens=usage_info.get("prompt_tokens", 0),
                            completion_tokens=usage_info.get("completion_tokens", 0)
                        )
                    else:
                        await update_stats(success=True)
                    logger.info(f"✅ 流式完成，模型: {model_name}")
                    return

            except Exception as e:
                logger.error(f"💥 模型 {model_name} 异常: {e}")
                last_error = str(e)
                continue

        await update_stats(success=False)
        yield f"data: {json.dumps({'error': {'message': f'所有模型均失败: {last_error}'}})}\n\n".encode()
        yield b"data: [DONE]\n\n"
    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )
    #return StreamingResponse(stream_generator(), media_type="text/event-stream")

# ================== Anthropic 兼容端点 ==================
@app.post("/v1/messages")
async def messages_endpoint(request: Request):
    try:
        body = await request.json()
        custom_system = (
            "你是 Claude Code，一个AI编程助手。你必须使用中文回复。\n"
            "- 优先使用专用工具（Read/Edit/Write/Glob/Grep）而非 Bash。\n"
            "- 回答简洁，直接给出操作或结果，不要冗长解释。"
        )
        body["system"] = custom_system        
        body.pop("grammar", None)
        deep_remove_key(body, "grammar")
        logger.info(f"📨 收到 /v1/messages, stream={body.get('stream')}")
        tools_in_request = body.get("tools", [])
        openai_tool_choice = "auto"

        if VERBOSE_LOG:
            if "messages" in body:
                logger.info("📥 输入消息 (Anthropic):\n" + pretty_print_messages(body["messages"]))
            if system := body.get("system"):
                logger.info(f"📥 系统提示: {truncate_text(str(system), 3000)}")
    except Exception as e:
        logger.error(f"❌ 无效JSON: {e}")
        return JSONResponse({"type": "error", "error": {"message": f"Invalid JSON: {str(e)}"}}, status_code=400)

    messages_list = body.get("messages", [])
    system = body.get("system", "")
    #stream = False  # 强制非流式，稳定兼容 Claude Code
    stream = True  # 强制流式，稳定兼容 Claude Code
    max_tokens = min(body.get("max_tokens", 120000), 120000)
    temperature = body.get("temperature", 0.70)
    anthropic_tools = body.get("tools", [])
    tool_choice = body.get("tool_choice")


    # ================== 核心转换（完整恢复） ==================
    openai_messages = []

    # 1. system
    if system:
        if isinstance(system, str):
            openai_messages.append({"role": "system", "content": system})
        elif isinstance(system, list):
            texts = [b["text"] for b in system if b.get("type") == "text"]
            if texts:
                openai_messages.append({"role": "system", "content": "\n".join(texts)})

    # 2. messages + 检测是否有工具历史
    has_tool_history = False
    for msg in messages_list:
        role = msg.get("role")
        content = msg.get("content")

        # 字符串 content
        if isinstance(content, str):
            openai_messages.append({"role": role, "content": content})
            continue

        # 列表 content
        if isinstance(content, list):
            texts = []
            tool_calls = []
            tool_results = []

            for block in content:
                if not isinstance(block, dict):
                    continue
                t = block.get("type")
                if t == "text":
                    texts.append(block.get("text", ""))
                elif t == "tool_use":
                    has_tool_history = True  # 检测到工具调用
                    args = block.get("input", {})
                    if isinstance(args, dict):
                        args = json.dumps(args, ensure_ascii=False)
                    tool_calls.append({
                        "id": block.get("id", f"call_{uuid.uuid4().hex[:8]}"),
                        "type": "function",
                        "function": {"name": block.get("name", ""), "arguments": args}
                    })
                elif t == "tool_result":
                    has_tool_history = True  # 检测到工具结果
                    res_content = block.get("content", "")
                    if isinstance(res_content, list):
                        res_text = " ".join([c.get("text", "") for c in res_content if c.get("type") == "text"])
                    else:
                        res_text = str(res_content)
                    tool_results.append({
                        "role": "tool",
                        "tool_call_id": block.get("tool_use_id", ""),
                        "content": res_text
                    })

            # 处理 assistant 带 tool_calls
            if role == "assistant" and tool_calls:
                msg_data = {"role": "assistant", "content": " ".join(texts) if texts else ""}
                msg_data["tool_calls"] = tool_calls
                openai_messages.append(msg_data)
            # 处理 user 带 tool_result
            elif role == "user" and tool_results:
                if texts:
                    openai_messages.append({"role": "user", "content": " ".join(texts)})
                openai_messages.extend(tool_results)
            # 普通文本块
            elif texts:
                openai_messages.append({"role": role, "content": " ".join(texts)})
            # 空消息，跳过
            continue

        # fallback
        openai_messages.append({"role": role, "content": str(content)})

        # ---------- 动态模型选择 ----------
    if tools_in_request:
        if has_tool_history:
            body["model"] = "qwen2.5-coder:3b" #"brain/Qwen/Qwen3.5-397B-A17B"
            logger.info("🔧 工具结果已返回，切换至 modelscope 大模型进行回答")
        else:
            body["model"] =  "hands/qwen2.5-coder-3b-instruct" #"hands/qwen2.5-coder-3b-instruct"
            logger.info("🔧 检测到 tools 字段（第一轮），路由至 hands 后端 (LM Studio :1234)")
    else:
        body["model"] = "brain/qwen2.5-coder:3b"  #"Qwen/Qwen3.5-397B-A17B"
        logger.info("💬 未检测到 tools 字段，自动路由至默认后端")
    # --------------------------------------------------------------------

    requested_model = body.get("model", "")
    backend, actual_model = get_backend_for_model(requested_model) if requested_model else (None, None)
    if not backend:
        backend = next(b for b in BACKENDS if b["name"] == DEFAULT_BACKEND)
    models_to_try = build_models_to_try(backend, actual_model) if actual_model else backend["models"][:5]

    # 工具调用指令（可选，保留原逻辑）
    if anthropic_tools:
        base_instruction = (
            "\n\n【重要指令】当你需要调用工具时，必须使用标准的 OpenAI 函数调用 JSON 格式，将工具调用放在 'tool_calls' 字段中。"
            "禁止使用任何 XML 标签（如 <tool_call>、<function> 等）或任何其他非 JSON 格式。"
            "你必须严格按照以下 JSON 结构输出工具调用：\n"
            '{"tool_calls": [{"id": "call_xxx", "type": "function", "function": {"name": "工具名", "arguments": "{\\"参数名\\":\\"参数值\\"}"}}]}'
        )
        if has_tool_history:
            tool_instruction = base_instruction + (
                "\n\n【注意】你已经获得了工具执行的结果。现在请根据结果直接给出最终回答，"
                "除非你确实需要调用另一个工具来补充信息，否则不要继续输出工具调用。"
            )
        else:
            tool_instruction = base_instruction + (
                "\n\n【特别要求】当前对话中，你必须使用工具来完成任务。请立即输出一个工具调用（tool_calls），"
                "不要输出普通文本回复，也不要直接结束对话。只有在工具执行完成并得到结果后，才能输出最终答案。"
            )

        # 仅在存在 tools 时才追加指令
        if openai_messages and openai_messages[0]["role"] == "system":
            openai_messages[0]["content"] += tool_instruction
        else:
            openai_messages.insert(0, {"role": "system", "content": tool_instruction})
    # 如果 anthropic_tools 为空，则什么也不追加，保持原始 system 内容不变
    # ========== 防止模型在工具调用后空回复 ==========
    if has_tool_history and anthropic_tools:
        # 1. 将指令注入到 system 消息中，而非追加 user 消息
        system_instruction = (
            "\n\n【强制要求】你现在已经获得了工具执行的结果。你必须基于这些结果生成回答。"
            "如果任务已经完成，请用中文给出最终答案；如果还需要其他信息，请继续调用工具。"
            "禁止输出空内容或仅输出空白字符。"
        )
        # 确保 system 消息存在
        if openai_messages and openai_messages[0]["role"] == "system":
            openai_messages[0]["content"] += system_instruction
        else:
            openai_messages.insert(0, {"role": "system", "content": system_instruction})
        if not tool_choice:
            openai_tool_choice = "auto"
            logger.info("🛡️ 检测到工具调用历史，tool_choice='auto' 让大模型自行决定")

    # 智能截断
    MAX_INPUT_TOKENS = 327680
    def estimate_tokens(messages):
        total = 0
        for msg in messages:
            content = str(msg.get("content", ""))
            total += len(content) // 2
            for tc in msg.get("tool_calls", []):
                total += len(json.dumps(tc)) // 2
        return total

    while estimate_tokens(openai_messages) > MAX_INPUT_TOKENS:
        cut = False
        for i, msg in enumerate(openai_messages):
            if msg.get("role") not in ("system", "tool"):
                del openai_messages[i]
                logger.warning(f"✂️ 截断了一条 {msg['role']} 消息以控制上下文长度")
                cut = True
                break
        if not cut:
            break

    # 确保对话以 user 消息结尾，且内容不为空（LM Studio 模板强制要求）
    if not openai_messages:
        openai_messages.append({"role": "user", "content": "Continue."})
    elif openai_messages[-1]["role"] != "user":
        # 如果最后一条不是 user，就追加一条
        openai_messages.append({"role": "user", "content": "Continue."})
    else:
        # 如果最后一条是 user，但内容为空或仅空白，赋予默认内容
        last_content = openai_messages[-1].get("content", "")
        if not last_content or not last_content.strip():
            openai_messages[-1]["content"] = "Continue."
        logger.warning("⚠️ 如果最后一条是 user，但内容为空或仅空白，赋予默认内容")

    # 转换 tools
    openai_tools = []
    for tool in anthropic_tools:
        openai_tools.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool.get("description", ""),
                "parameters": tool.get("input_schema", {})
            }
        })

    openai_tool_choice = "auto"
    if tool_choice:
        tc_type = tool_choice.get("type")
        if tc_type == "auto":
            openai_tool_choice = "auto"
        elif tc_type == "any":
            openai_tool_choice = "required"
        elif tc_type == "tool":
            openai_tool_choice = {"type": "function", "function": {"name": tool_choice.get("name")}}

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {backend['api_key']}"
    }
    payload_temperature = 0.1 if anthropic_tools else temperature

    # 非流式
    if not stream:
        # 根据 has_tool_history 决定是否强制 tool_choice
        if openai_tools and not tool_choice:
            if not has_tool_history:
                openai_tool_choice = "required"
                logger.info("🔧 第一轮工具调用，强制 tool_choice=required")
            else:
                openai_tool_choice = "auto"   
        last_exception = None
        for idx, model_name in enumerate(models_to_try):
            payload = {
                "model": model_name,
                "messages": openai_messages,
                "max_tokens": max_tokens,
                "temperature": payload_temperature,
                "stream": False,
                #"frequency_penalty": 0.5,   # 新增：抑制重复 n-gram
                #"presence_penalty": 0.2,    # 新增：鼓励话题多样性
            }
            payload.pop("grammar", None)
            if openai_tools:
                payload["tools"] = openai_tools
                payload["tool_choice"] = openai_tool_choice

            logger.info(f"🚀 尝试非流式模型 {model_name} ({idx+1}/{len(models_to_try)})")
            try:
                resp = await request_with_retry(
                    "POST",
                    f"{backend['base_url']}/chat/completions",
                    headers=headers,
                    json_data=payload
                )
                # ----- 新增：安全读取并解析 JSON -----
                content_bytes = await resp.aread()
                if not content_bytes:
                    raise Exception("后端返回空响应")
                try:
                    data = json.loads(content_bytes)
                except json.JSONDecodeError as e:
                    logger.error(f"❌ JSON解析失败，原始响应前300字符: {content_bytes[:300]}")
                    raise Exception(f"后端返回非JSON数据: {content_bytes[:200].decode('utf-8', errors='ignore')}")
                # ------------------------------------
                if "error" in data:
                    error_msg = data["error"].get("message", str(data["error"]))
                    logger.error(f"❌ 后端返回错误(200内): {error_msg}")
                    raise Exception(f"Backend error: {error_msg}")
                if "choices" in data:
                    for choice in data["choices"]:
                        if "message" in choice and "content" in choice["message"]:
                            choice["message"]["content"] = clean_response_text(choice["message"]["content"])

                choice = data["choices"][0]
                message = choice.get("message", {})
                content_blocks = []
                if not message.get("content") and "reasoning_content" in message:
                    logger.warning("⚠️ 模型仅返回 reasoning_content，将其作为内容返回")
                    message["content"] = message["reasoning_content"]
                if text_content := message.get("content"):
                    cleaned_text = clean_response_text(text_content)
                    content_blocks.append({"type": "text", "text": cleaned_text})
                if tool_calls := message.get("tool_calls"):
                    for tc in tool_calls:
                        try:
                            args = json.loads(tc["function"]["arguments"])
                        except:
                            args = {}
                        content_blocks.append({
                            "type": "tool_use",
                            "id": tc["id"],
                            "name": tc["function"]["name"],
                            "input": args
                        })

                claude_response = {
                    "id": f"msg_{uuid.uuid4().hex[:24]}",  # 需导入 uuid
                    "type": "message",
                    "role": "assistant",
                    "content": content_blocks,
                    "model": model_name,
                    "stop_reason": "tool_use" if tool_calls else "end_turn",
                    "stop_sequence": None,
                    "usage": {
                        "input_tokens": data.get("usage", {}).get("prompt_tokens", 0),
                        "output_tokens": data.get("usage", {}).get("completion_tokens", 0)
                    }
                }
                usage = claude_response["usage"]
                await update_stats(
                    success=True,
                    prompt_tokens=usage["input_tokens"],
                    completion_tokens=usage["output_tokens"]
                )
                logger.info(f"✅ 成功使用模型 {model_name}，Token使用: {usage}")
                log_packet("response", claude_response)
                if "__verbose" in data:
                    del data["__verbose"]
                return JSONResponse(content=claude_response)

            except Exception as e:
                logger.warning(f"⚠️ 模型 {model_name} 失败: {e}")
                last_exception = e
                await asyncio.sleep(MODEL_SWITCH_DELAY)
                continue

        await update_stats(success=False)
        return JSONResponse({"type": "error", "error": {"message": f"所有模型均失败: {last_exception}"}}, status_code=500)

    # 流式（同样根据 has_tool_history 调整 tool_choice）
    async def anthropic_stream_generator():
        last_error = None
        nonlocal_openai_tool_choice = openai_tool_choice  # 避免闭包变量问题
        if openai_tools and not tool_choice:
            if not has_tool_history:
                nonlocal_openai_tool_choice = "required"
                logger.info("🔧 第一轮工具调用，强制 tool_choice=required")
            else:
                nonlocal_openai_tool_choice = "auto"  
        logger.info("📤 发送事件: message_start")   # 示例
        for idx, model_name in enumerate(models_to_try):
            payload = {
                "model": model_name,
                "messages": openai_messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "stream": True,
                #"frequency_penalty": 0.5,   # 新增
                #"presence_penalty": 0.2,    # 新增
            }
            payload.pop("grammar", None)
            if openai_tools:
                payload["tools"] = openai_tools
                payload["tool_choice"] = nonlocal_openai_tool_choice

            logger.info(f"🌊 尝试流式模型 {model_name} ({idx+1}/{len(models_to_try)})")
            try:
                await asyncio.sleep(MODEL_SWITCH_DELAY)
                async with client.stream(
                    "POST",
                    f"{backend['base_url']}/chat/completions",
                    headers=headers,
                    json=payload
                ) as resp:
                    if resp.status_code != 200:
                        error_body = await resp.aread()
                        error_msg = error_body.decode()
                        logger.error(f"❌ 模型 {model_name} 错误 {resp.status_code}: {error_msg}")
                        if resp.status_code == 429:
                            last_error = error_msg
                            continue
                        yield f"event: error\ndata: {json.dumps({'error': {'message': error_msg}})}\n\n"
                        return

                    message_started = False
                    tool_call_buffers: Dict[int, Dict[str, Any]] = {}
                    text_block_started = False
                    usage_info = None
                    finish_reason = None
                    collected_content = ""  # 用于补发一次性内容

                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            # 补发可能遗漏的文本块结束事件
                            if text_block_started:
                                yield f"event: content_block_stop\ndata: {json.dumps({'type': 'content_block_stop', 'index': 0})}\n\n"
                                text_block_started = False

                            # 结束所有工具调用块
                            for idx_tool in list(tool_call_buffers.keys()):
                                yield f"event: content_block_stop\ndata: {json.dumps({'type': 'content_block_stop', 'index': idx_tool})}\n\n"
                            tool_call_buffers.clear()

                            # 如果从未发送过 message_start（极端情况），补发
                            if not message_started:
                                message_id = f"msg_{int(time.time()*1000)}_{idx}"
                                yield f"event: message_start\ndata: {json.dumps({'type': 'message_start', 'message': {'id': message_id, 'type': 'message', 'role': 'assistant', 'content': [], 'model': model_name, 'stop_reason': None, 'stop_sequence': None, 'usage': {'input_tokens': 0, 'output_tokens': 0}}})}\n\n"
                                message_started = True
                            # 映射 OpenAI finish_reason 到 Anthropic stop_reason
                            mapped_stop_reason = "end_turn"
                            if finish_reason == "tool_calls":
                                mapped_stop_reason = "tool_use"
                            elif finish_reason == "stop":
                                mapped_stop_reason = "end_turn"
                            elif finish_reason == "length":
                                mapped_stop_reason = "max_tokens"
                            # 其他未知情况保持 "end_turn"

                            delta_payload = {
                                "type": "message_delta",
                                "delta": {
                                    "stop_reason": mapped_stop_reason,
                                    "stop_sequence": None
                                },
                                "usage": usage_info if usage_info else {"input_tokens": 0, "output_tokens": 0}
                            }
                            delta_payload = {
                                "type": "message_delta",
                                "delta": {
                                    "stop_reason": finish_reason or "end_turn",
                                    "stop_sequence": None
                                },
                                "usage": usage_info if usage_info else {"input_tokens": 0, "output_tokens": 0}
                            }
                            yield f"event: message_delta\ndata: {json.dumps(delta_payload)}\n\n"
                            yield f"event: message_stop\ndata: {json.dumps({'type': 'message_stop'})}\n\n"
                            break

                        try:
                            chunk = json.loads(data_str)
                            if "error" in chunk:
                                raise Exception(chunk["error"].get("message", "Unknown error"))

                            if 'usage' in chunk:
                                usage_info = {
                                    "input_tokens": chunk['usage'].get('prompt_tokens', 0),
                                    "output_tokens": chunk['usage'].get('completion_tokens', 0)
                                }

                            choices = chunk.get("choices", [])
                            if choices and choices[0].get("finish_reason"):
                                finish_reason = choices[0]["finish_reason"]

                            delta = choices[0].get("delta", {}) if choices else {}

                            # 首次有效 delta 时发送 message_start
                            if not message_started:
                                message_started = True
                                message_id = f"msg_{int(time.time()*1000)}_{idx}"
                                message_start_payload = {
                                    "type": "message_start",
                                    "message": {
                                        "id": message_id,
                                        "type": "message",
                                        "role": "assistant",
                                        "content": [],
                                        "model": model_name,
                                        "stop_reason": None,
                                        "stop_sequence": None,
                                        "usage": {"input_tokens": 0, "output_tokens": 0}
                                    }
                                }
                                yield f"event: message_start\ndata: {json.dumps(message_start_payload)}\n\n"

                            # 处理文本内容
                            if "content" in delta and delta["content"]:
                                cleaned_delta = clean_response_text(delta["content"])
                                collected_content += cleaned_delta
                                if not text_block_started:
                                    text_block_started = True
                                    yield f"event: content_block_start\ndata: {json.dumps({'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'text', 'text': ''}})}\n\n"
                                yield f"event: content_block_delta\ndata: {json.dumps({'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'text_delta', 'text': cleaned_delta}})}\n\n"

                            # 处理工具调用
                            if "tool_calls" in delta:
                                for tc_delta in delta["tool_calls"]:
                                    idx_tool = tc_delta.get("index", 0)
                                    if idx_tool not in tool_call_buffers:
                                        tc_id = tc_delta.get("id", f"call_{idx_tool}")
                                        tc_name = tc_delta.get("function", {}).get("name", "")
                                        tool_call_buffers[idx_tool] = {"id": tc_id, "name": tc_name, "arguments": ""}
                                        yield f"event: content_block_start\ndata: {json.dumps({'type': 'content_block_start', 'index': idx_tool, 'content_block': {'type': 'tool_use', 'id': tc_id, 'name': tc_name, 'input': {}}})}\n\n"
                                    if "function" in tc_delta and "arguments" in tc_delta["function"]:
                                        args_delta = tc_delta["function"]["arguments"]
                                        tool_call_buffers[idx_tool]["arguments"] += args_delta
                                        yield f"event: content_block_delta\ndata: {json.dumps({'type': 'content_block_delta', 'index': idx_tool, 'delta': {'type': 'input_json_delta', 'partial_json': args_delta}})}\n\n"

                        except json.JSONDecodeError:
                            logger.warning(f"⚠️ 无法解析块: {data_str}")
                            continue
                    if usage_info:
                        await update_stats(
                            success=True,
                            prompt_tokens=usage_info.get('input_tokens', 0),
                            completion_tokens=usage_info.get('output_tokens', 0)
                        )
                    else:
                        await update_stats(success=True)
                    logger.info(f"✅ 流式完成，模型: {model_name}")
                    return

            except Exception as e:
                logger.error(f"💥 模型 {model_name} 异常: {e}")
                last_error = str(e)
                continue
        await update_stats(success=False)
        yield f"event: error\ndata: {json.dumps({'error': {'message': f'所有模型均失败: {last_error}'}})}\n\n"
        yield f"event: message_stop\ndata: {json.dumps({'type': 'message_stop'})}\n\n"
    return StreamingResponse(
        anthropic_stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )
    #return StreamingResponse(anthropic_stream_generator(), media_type="text/event-stream")

# ================== 启动服务 ==================
if __name__ == "__main__":
    startup_interaction()
    import uvicorn
    import socket

    def get_local_ips():
        ips = []
        hostname = socket.gethostname()
        ips.append(socket.gethostbyname(hostname))
        try:
            for ip in socket.gethostbyname_ex(hostname)[2]:
                ips.append(ip)
        except:
            pass
        return list(set(ips))

    PORT = 8082
    print("\n🚀 统一多后端代理服务运行于:")
    for ip in get_local_ips():
        print(f"  http://{ip}:{PORT}")
    print("\n✅ 端点:")
    print("  - /v1/chat/completions  (OpenAI)")
    print("  - /v1/messages           (Anthropic)")
    print("  - /v1/models             (列出所有模型)")
    print("\n📋 已配置后端:")
    for b in BACKENDS:
        print(f"  - {b['name']}: {len(b['models'])} 个模型")
    print("\n按 Ctrl+C 停止服务。\n")

    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")