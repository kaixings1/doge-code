import httpx
import asyncio
import logging
import json
import time
import random
import socket

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse

# ============================================================================
# 全局配置
# ============================================================================
VERBOSE_LOG = True          # 详细日志开关
DEBUG_HEADERS = True        # 是否打印请求头（脱敏）
timecounts = 3               # 模型切换前的等待秒数（已改为异步 sleep）

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("modelscope-proxy")

if VERBOSE_LOG:
    logging.getLogger("httpx").setLevel(logging.INFO)

app = FastAPI()

# ============================================================================
# 中间件：打印请求头和响应耗时
# ============================================================================
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """记录每个请求的方法、路径、请求头（脱敏）和响应耗时"""
    logger.info(f"Incoming request: {request.method} {request.url.path}")
    # 打印请求头（脱敏）
    if DEBUG_HEADERS:
        headers_dict = dict(request.headers)
        # 脱敏 Authorization
        if "authorization" in headers_dict:
            auth = headers_dict["authorization"]
            if len(auth) > 8:
                headers_dict["authorization"] = auth[:6] + "****" + auth[-4:]
        logger.info(f"Request headers: {json.dumps(headers_dict, indent=2)}")
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    logger.info(f"Response status: {response.status_code} completed in {process_time:.3f}s")
    return response

# ============================================================================
# 根路径健康检查（解决 HEAD / 404）
# ============================================================================
@app.head("/")
@app.get("/")
async def root():
    """健康检查端点，返回服务基本信息，解决客户端 HEAD / 请求返回 404 的问题"""
    logger.info("Root endpoint called (health check)")
    return JSONResponse(content={
        "status": "ok",
        "service": "ModelScope Proxy",
        "version": "2.1.0",
        "endpoints": ["/v1/chat/completions", "/v1/messages", "/v1/messages/count_tokens", "/v1/models"]
    })

# ============================================================================
# ModelScope 配置
# ============================================================================
MODELSCOPE_BASE_URL = "https://api-inference.modelscope.cn/v1"
MODELSCOPE_API_KEY = "ms-e0186609-9d27-4542-a733-4cf18b89c9dd"  # 请替换为您自己的 Key

# ============================================================================
# 多模型配置（按优先级排序）
# ============================================================================
MODELS_LIST = [    
    "Qwen/Qwen3.5-397B-A17B",
    "Qwen/Qwen3-32B",
    "XiaomiMiMo/MiMo-V2-Flash",
    "Qwen/Qwen3-8B",
    "Qwen/Qwen3-4B",
    "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    "deepseek-ai/DeepSeek-R1-0528",
    "ZhipuAI/GLM-5",
    "deepseek-ai/DeepSeek-V3.2",
    "Qwen/Qwen2.5-72B-Instruct",  
    "MiniMax/MiniMax-M2.5",    
    "Qwen/Qwen3.5-35B-A3B",
    "Qwen/Qwen3.5-27B",
    "ZhipuAI/glm-4-9b-chat",
    "ZhipuAI/GLM-4.7-Flash",
    "baichuan-inc/Baichuan2-13B-Chat",
    "01-ai/Yi-34B-Chat",
    "hfl/chinese-llama-2-7b"
]

client = httpx.AsyncClient(timeout=120.0)

# ============================================================================
# 辅助函数
# ============================================================================
def mask_api_key(key: str) -> str:
    """对 API Key 进行脱敏处理，用于日志输出"""
    if len(key) > 8:
        return key[:4] + "****" + key[-4:]
    return "***"

def truncate_text(text: str, max_len: int = 1500) -> str:
    """截断过长的文本，避免日志过大"""
    if len(text) <= max_len:
        return text
    return text[:max_len] + f"...[truncated, total {len(text)} chars]"

def pretty_print_messages(messages):
    """格式化打印消息列表，便于调试"""
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
        lines.append(f"  {role}: {truncate_text(content, 300)}")
    return "\n".join(lines)

def clamp_max_tokens(max_tokens: int, model_name: str = None) -> int:
    """
    限制 max_tokens 在模型支持的范围内。
    ModelScope 上多数模型支持 1~16384，超出会报错。
    """
    MAX_ALLOWED = 16384
    MIN_ALLOWED = 1
    if max_tokens < MIN_ALLOWED:
        logger.warning(f"max_tokens {max_tokens} below minimum, clamping to {MIN_ALLOWED}")
        return MIN_ALLOWED
    if max_tokens > MAX_ALLOWED:
        logger.warning(f"max_tokens {max_tokens} exceeds limit for {model_name or 'unknown'}, clamping to {MAX_ALLOWED}")
        return MAX_ALLOWED
    return max_tokens

async def request_with_retry(method, url, **kwargs):
    """
    自动重试 429 错误（指数退避），并打印请求/响应详情。
    修复了原代码中变量名 retries 未定义的错误。
    """
    max_retries = 3
    headers_safe = {k: mask_api_key(v) if k.lower() == "authorization" else v for k, v in kwargs.get("headers", {}).items()}
    logger.info(f"Request: {method} {url} | Headers: {headers_safe}")
    if "json" in kwargs:
        body_str = json.dumps(kwargs["json"], ensure_ascii=False)
        if len(body_str) > 500:
            body_str = body_str[:500] + "...[truncated]"
        logger.info(f"Request body: {body_str}")
    
    for attempt in range(max_retries):
        resp = await client.request(method, url, **kwargs)
        logger.info(f"Response status: {resp.status_code}")
        if resp.status_code == 429:
            wait = (2 ** attempt) + random.uniform(0, 1)   # 使用 attempt 而不是未定义的 retries
            logger.warning(f"429, 等待 {wait:.1f} 秒后重试")
            await asyncio.sleep(wait)
            continue
        if resp.status_code >= 400:
            error_text = await resp.aread()
            logger.error(f"Error response body: {error_text.decode()}")
        resp.raise_for_status()
        return resp
    raise Exception("Max retries exceeded for 429 (quota exhausted)")

def build_models_to_try(requested_model: str = None):
    """
    构造要尝试的模型列表，优先使用请求中指定的模型，然后使用配置列表（去重）。
    如果请求的模型不在预置列表中，会将其放在最前面尝试。
    """
    models = []
    if requested_model and requested_model not in MODELS_LIST:
        models.append(requested_model)
    models.extend([m for m in MODELS_LIST if m != requested_model])
    seen = set()
    unique_models = []
    for m in models:
        if m not in seen:
            seen.add(m)
            unique_models.append(m)
    return unique_models

# ============================================================================
# 路由：OpenAI 兼容接口 /v1/chat/completions
# ============================================================================
@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """处理 OpenAI 格式的聊天请求，支持多模型自动切换和流式输出"""
    try:
        body = await request.json()
        logger.info(f"Received /v1/chat/completions request, stream={body.get('stream')}")
        # 打印请求中的 model 字段
        requested_model = body.get("model")
        logger.info(f"Requested model in body: {requested_model}")
        if VERBOSE_LOG and "messages" in body and body["messages"] is not None:
            if isinstance(body["messages"], list):
                logger.info("📥 Local input messages:\n" + pretty_print_messages(body["messages"]))
            else:
                logger.warning("messages field is not a list, skipping pretty print")
    except Exception as e:
        logger.error(f"Invalid JSON: {e}")
        return JSONResponse(content={"error": f"Invalid JSON: {str(e)}"}, status_code=400)

    requested_model = body.get("model")
    models_to_try = build_models_to_try(requested_model)
    if not models_to_try:
        models_to_try = MODELS_LIST.copy()
    logger.info(f"Will try models in order: {models_to_try}")
    await asyncio.sleep(5)  # 启动延迟，避免突发
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {MODELSCOPE_API_KEY}"
    }

    if body.get("stream"):
        async def generate():
            last_error = None
            for idx, model_name in enumerate(models_to_try):
                body["model"] = model_name
                logger.info(f"Attempting stream with model {model_name} ({idx+1}/{len(models_to_try)})")
                try:
                    await asyncio.sleep(timecounts)  # 改为异步 sleep
                    async with client.stream(
                        "POST",
                        f"{MODELSCOPE_BASE_URL}/chat/completions",
                        json=body,
                        headers=headers,
                        timeout=60.0
                    ) as resp:
                        if resp.status_code == 429:
                            error_body = await resp.aread()
                            error_msg = error_body.decode()
                            logger.warning(f"Model {model_name} returned 429: {error_msg}")
                            last_error = error_msg
                            continue
                        if resp.status_code != 200:
                            error_body = await resp.aread()
                            error_msg = error_body.decode()
                            logger.error(f"Model {model_name} error {resp.status_code}: {error_msg}")
                            error_event = {
                                "error": {
                                    "message": f"ModelScope error {resp.status_code}: {error_msg}",
                                    "type": "api_error",
                                    "code": resp.status_code
                                }
                            }
                            yield f"data: {json.dumps(error_event)}\n\n"
                            yield f"data: [DONE]\n\n"
                            return
                        
                        async for chunk in resp.aiter_bytes():
                            if VERBOSE_LOG:
                                chunk_str = chunk.decode('utf-8', errors='replace')
                                logger.debug(f"📤 Remote stream chunk: {truncate_text(chunk_str, 200)}")
                            yield chunk
                        return
                except Exception as e:
                    logger.error(f"Exception with model {model_name}: {e}")
                    last_error = str(e)
                    continue
            error_event = {
                "error": {
                    "message": f"All models failed. Last error: {last_error}",
                    "type": "all_models_failed"
                }
            }
            yield f"data: {json.dumps(error_event)}\n\n"
            yield f"data: [DONE]\n\n"
        
        return StreamingResponse(generate(), media_type="text/event-stream")
    else:
        last_exception = None
        for idx, model_name in enumerate(models_to_try):
            body["model"] = model_name
            logger.info(f"Attempting non-stream with model {model_name} ({idx+1}/{len(models_to_try)})")
            # 限制 max_tokens
            if "max_tokens" in body:
                body["max_tokens"] = clamp_max_tokens(body["max_tokens"], model_name)
            try:
                resp = await request_with_retry(
                    "POST",
                    f"{MODELSCOPE_BASE_URL}/chat/completions",
                    json=body,
                    headers=headers
                )
                response_json = resp.json()
                logger.info(f"Success with model {model_name}, usage={response_json.get('usage')}")
                if VERBOSE_LOG:
                    logger.info(f"📥 Remote response: model={response_json.get('model')}, choices count={len(response_json.get('choices', []))}")
                    if response_json.get("choices"):
                        content_preview = response_json["choices"][0].get("message", {}).get("content", "")
                        logger.info(f"📥 Response content preview: {truncate_text(content_preview, 300)}")
                return JSONResponse(content=response_json)
            except Exception as e:
                logger.warning(f"Model {model_name} failed: {e}")
                last_exception = e
                continue
        logger.error("All models failed")
        return JSONResponse(content={"error": f"All models failed. Last error: {last_exception}"}, status_code=500)

# ================== 路由：Anthropic 兼容接口（融合 tools 支持） ==================
@app.post("/v1/messages")
async def messages(request: Request):
    """将 Anthropic /v1/messages 转换为 OpenAI 格式，支持 tools 和 tool_calls 双向转换"""
    body = await request.json()
    logger.info(f"Received /v1/messages request, stream={body.get('stream')}")
    # 打印请求中的 model 字段（Anthropic 格式没有 model，但我们可以记下）
    logger.info("Anthropic request does not contain 'model' field, will use proxy's model list")
    
    if VERBOSE_LOG:
        if "messages" in body:
            logger.info("📥 Local input messages (Anthropic format):\n" + pretty_print_messages(body["messages"]))
        if "system" in body and body["system"]:
            logger.info(f"📥 System prompt: {truncate_text(body['system'], 300)}")
    
    messages_list = body.get("messages", [])
    system = body.get("system", "")
    stream = body.get("stream", False)
    max_tokens = body.get("max_tokens", 4096)
    temperature = body.get("temperature", 1.0)
    anthropic_tools = body.get("tools", [])
    tool_choice = body.get("tool_choice", None)

    # 转换消息格式（Anthropic -> OpenAI）
    openai_messages = []
    if system:
        openai_messages.append({"role": "system", "content": system})
    for msg in messages_list:
        role = msg["role"]
        content = msg["content"]
        if isinstance(content, list):
            texts = []
            for c in content:
                if c.get("type") == "text":
                    texts.append(c["text"])
                elif c.get("type") == "tool_result":
                    if "content" in c:
                        if isinstance(c["content"], list):
                            for sub in c["content"]:
                                if sub.get("type") == "text":
                                    texts.append(sub["text"])
                        else:
                            texts.append(str(c["content"]))
            content = " ".join(texts) if texts else ""
        openai_messages.append({"role": role, "content": content})
    
    if VERBOSE_LOG:
        logger.info("🔄 Converted to OpenAI messages:\n" + pretty_print_messages(openai_messages))

    # 转换 tools（Anthropic -> OpenAI）
    openai_tools = []
    if anthropic_tools:
        for tool in anthropic_tools:
            openai_tools.append({
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                    "parameters": tool.get("input_schema", {})
                }
            })
        if VERBOSE_LOG:
            logger.info(f"🔄 Converted {len(openai_tools)} tools to OpenAI format")

    # 转换 tool_choice（Anthropic -> OpenAI）
    openai_tool_choice = None
    if tool_choice:
        if tool_choice.get("type") == "auto":
            openai_tool_choice = "auto"
        elif tool_choice.get("type") == "any":
            openai_tool_choice = "required"
        elif tool_choice.get("type") == "tool":
            openai_tool_choice = {
                "type": "function",
                "function": {"name": tool_choice.get("name")}
            }
        else:
            openai_tool_choice = "auto"

    models_to_try = build_models_to_try(None)
    if not models_to_try:
        models_to_try = MODELS_LIST.copy()
    logger.info(f"Will try models in order: {models_to_try}")
    await asyncio.sleep(5)
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {MODELSCOPE_API_KEY}"
    }

    # 非流式处理
    if not stream:
        last_exception = None
        for idx, model_name in enumerate(models_to_try):
            openai_payload = {
                "model": model_name,
                "messages": openai_messages,
                "max_tokens": clamp_max_tokens(max_tokens, model_name),
                "temperature": temperature,
                "stream": False,
            }
            if openai_tools:
                openai_payload["tools"] = openai_tools
            if openai_tool_choice:
                openai_payload["tool_choice"] = openai_tool_choice

            logger.info(f"Attempting non-stream with model {model_name} ({idx+1}/{len(models_to_try)})")
            try:
                resp = await request_with_retry(
                    "POST",
                    f"{MODELSCOPE_BASE_URL}/chat/completions",
                    json=openai_payload,
                    headers=headers
                )
                data = resp.json()
                if "error" in data:
                    error_msg = data["error"].get("message", "Unknown error")
                    logger.error(f"Model {model_name} returned error: {error_msg}")
                    last_exception = Exception(error_msg)
                    continue

                choice = data.get("choices", [{}])[0]
                message = choice.get("message", {})
                content_blocks = []

                # 处理文本内容
                if message.get("content"):
                    content_blocks.append({"type": "text", "text": message["content"]})

                # 处理工具调用
                if message.get("tool_calls"):
                    for tc in message["tool_calls"]:
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

                # 构建 Anthropic 响应
                claude_response = {
                    "id": data.get("id", "unknown"),
                    "type": "message",
                    "role": "assistant",
                    "content": content_blocks,
                    "model": data.get("model", model_name),
                    "stop_reason": "tool_use" if message.get("tool_calls") else "end_turn",
                    "stop_sequence": None,
                    "usage": {
                        "input_tokens": data.get("usage", {}).get("prompt_tokens", 0),
                        "output_tokens": data.get("usage", {}).get("completion_tokens", 0)
                    }
                }
                logger.info(f"Success with model {model_name}, tokens: {claude_response['usage']}")
                if VERBOSE_LOG:
                    logger.info(f"📥 Remote response content blocks: {len(content_blocks)} blocks")
                    logger.info(f"📤 Returning to local: {truncate_text(json.dumps(claude_response, ensure_ascii=False), 500)}")
                return JSONResponse(content=claude_response)

            except Exception as e:
                logger.warning(f"Model {model_name} failed: {e}")
                last_exception = e
                continue

        logger.error("All models failed")
        return JSONResponse(content={"type": "error", "error": {"message": f"All models failed. Last error: {last_exception}"}}, status_code=500)

    # 流式处理
    else:
        async def stream_generate():
            last_error = None
            tool_call_buffers = {}
            current_text = ""
            # 限制 max_tokens 在有效范围
            max_tokens_clamped = clamp_max_tokens(max_tokens, "unknown")
            
            for idx, model_name in enumerate(models_to_try):
                openai_payload = {
                    "model": model_name,
                    "messages": openai_messages,
                    "max_tokens": max_tokens_clamped,
                    "temperature": temperature,
                    "stream": True,
                }
                if openai_tools:
                    openai_payload["tools"] = openai_tools
                if openai_tool_choice:
                    openai_payload["tool_choice"] = openai_tool_choice

                logger.info(f"Attempting stream with model {model_name} ({idx+1}/{len(models_to_try)})")
                try:
                    await asyncio.sleep(timecounts)
                    async with client.stream(
                        "POST",
                        f"{MODELSCOPE_BASE_URL}/chat/completions",
                        json=openai_payload,
                        headers=headers
                    ) as resp:
                        if resp.status_code == 429:
                            error_body = await resp.aread()
                            error_msg = error_body.decode()
                            logger.warning(f"Model {model_name} returned 429: {error_msg}")
                            last_error = error_msg
                            continue
                        if resp.status_code != 200:
                            error_body = await resp.aread()
                            error_msg = error_body.decode()
                            logger.error(f"Model {model_name} error {resp.status_code}: {error_msg}")
                            error_event = {
                                "type": "error",
                                "error": {
                                    "type": "api_error",
                                    "message": f"ModelScope error {resp.status_code}: {error_msg}"
                                }
                            }
                            yield f"data: {json.dumps(error_event)}\n\n"
                            yield f"data: {json.dumps({'type': 'message_stop'})}\n\n"
                            return

                        tool_call_buffers.clear()
                        current_text = ""

                        async for line in resp.aiter_lines():
                            if not line.startswith("data: "):
                                continue
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                for idx_tool, buf in tool_call_buffers.items():
                                    if buf["arguments"]:
                                        yield f"data: {json.dumps({'type': 'content_block_stop', 'index': idx_tool})}\n\n"
                                yield f"data: {json.dumps({'type': 'message_stop'})}\n\n"
                                return

                            try:
                                chunk = json.loads(data_str)
                                if chunk is None:
                                    continue
                                if "error" in chunk:
                                    logger.error(f"ModelScope error chunk: {chunk['error']}")
                                    error_event = {
                                        "type": "error",
                                        "error": {"type": "api_error", "message": chunk["error"].get("message", "Unknown error")}
                                    }
                                    yield f"data: {json.dumps(error_event)}\n\n"
                                    break

                                delta = chunk.get("choices", [{}])[0].get("delta", {})
                                if delta is None:
                                    continue
                                if "content" in delta and delta["content"]:
                                    current_text += delta["content"]
                                    yield f"data: {json.dumps({'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'text_delta', 'text': delta['content']}})}\n\n"

                                if "tool_calls" in delta:
                                    for tc_delta in delta["tool_calls"]:
                                        idx_tool = tc_delta.get("index", 0)
                                        if idx_tool not in tool_call_buffers:
                                            tc_id = tc_delta.get("id", f"call_{idx_tool}")
                                            tc_name = tc_delta.get("function", {}).get("name", "")
                                            tool_call_buffers[idx_tool] = {"id": tc_id, "name": tc_name, "arguments": ""}
                                            start_event = {
                                                "type": "content_block_start",
                                                "index": idx_tool,
                                                "content_block": {
                                                    "type": "tool_use",
                                                    "id": tc_id,
                                                    "name": tc_name,
                                                    "input": {}
                                                }
                                            }
                                            yield f"data: {json.dumps(start_event)}\n\n"
                                        if "function" in tc_delta and "arguments" in tc_delta["function"]:
                                            args_delta = tc_delta["function"]["arguments"]
                                            tool_call_buffers[idx_tool]["arguments"] += args_delta
                                            yield f"data: {json.dumps({'type': 'content_block_delta', 'index': idx_tool, 'delta': {'type': 'input_json_delta', 'partial_json': args_delta}})}\n\n"

                            except json.JSONDecodeError:
                                logger.warning(f"Failed to parse chunk: {data_str}")
                                continue

                        yield f"data: {json.dumps({'type': 'message_stop'})}\n\n"
                        return

                except Exception as e:
                    logger.error(f"Exception with model {model_name}: {e}")
                    last_error = str(e)
                    continue

            error_event = {
                "type": "error",
                "error": {"message": f"All models failed. Last error: {last_error}"}
            }
            yield f"data: {json.dumps(error_event)}\n\n"
            yield f"data: {json.dumps({'type': 'message_stop'})}\n\n"

        return StreamingResponse(stream_generate(), media_type="text/event-stream")

# ============================================================================
# 尝试导入 tiktoken 用于精确计数（可选依赖）
# ============================================================================
try:
    import tiktoken
    TOKENIZER = tiktoken.get_encoding("cl100k_base")
    logger.info("tiktoken loaded, will use exact token counting")
except ImportError:
    TOKENIZER = None
    logger.warning("tiktoken not installed, using fallback token estimation")
def count_tokens_approximate(text: str) -> int:
    """回退估算：中英文混合约 1 token ≈ 4 字符（粗略）"""
    return len(text) // 4
def count_tokens_exact(text: str) -> int:
    """精确计数（需要 tiktoken）"""
    if TOKENIZER:
        return len(TOKENIZER.encode(text))
    else:
        return count_tokens_approximate(text)
# ============================================================================
# 路由：Anthropic Token 计数端点 /v1/messages/count_tokens
# ============================================================================
@app.post("/v1/messages/count_tokens")
async def count_tokens(request: Request):
    """
    模拟 Anthropic 的 token 计数端点。
    接收与 /v1/messages 相同的请求体，返回 input_tokens。
    优先使用 tiktoken 精确计数，否则回退到估算。
    """
    body = await request.json()
    logger.info("Received /v1/messages/count_tokens request")
    # 提取所有文本内容进行计数
    system = body.get("system", "")
    messages_list = body.get("messages", [])
    all_text = ""
    if system:
        # system 可能是字符串或列表
        if isinstance(system, str):
            all_text += system + "\n"
        elif isinstance(system, list):
            for item in system:
                if item.get("type") == "text":
                    all_text += item.get("text", "") + "\n"
    for msg in messages_list:
        content = msg.get("content", "")
        if isinstance(content, list):
            for c in content:
                if c.get("type") == "text":
                    all_text += c.get("text", "") + "\n"
                elif c.get("type") == "tool_result" and "content" in c:
                    # 工具结果中的文本也要计数
                    if isinstance(c["content"], list):
                        for sub in c["content"]:
                            if sub.get("type") == "text":
                                all_text += sub.get("text", "") + "\n"
                    else:
                        all_text += str(c["content"]) + "\n"
        else:
            all_text += str(content) + "\n"
    # 计数
    token_count = count_tokens_exact(all_text)
    logger.info(f"Counted {token_count} tokens (method: {'tiktoken' if TOKENIZER else 'fallback'})")
    return JSONResponse(content={"input_tokens": token_count})
# ============================================================================
# 路由：模型列表
# ============================================================================
@app.get("/v1/models")
async def models():
    """返回代理支持的模型列表（OpenAI 格式）"""
    logger.info("Models list requested")
    return JSONResponse(content={
        "object": "list",
        "data": [{"id": m, "object": "model", "created": 1677610602, "owned_by": "modelscope"} for m in MODELS_LIST]
    })

# ============================================================================
# 获取本机 IP 辅助函数（原代码中有）
# ============================================================================
def get_local_ips():
    ips = []
    hostname = socket.gethostname()
    ips.append(socket.gethostbyname(hostname))
    try:
        for ip in socket.gethostbyaddr(socket.gethostbyname(hostname))[2]:
            ips.append(ip)
    except:
        pass
    return list(set(ips))

# ============================================================================
# 启动入口
# ============================================================================
if __name__ == "__main__":
    import uvicorn
    print("ModelScope Proxy running on:")
    for ip in get_local_ips():
        print(f"  http://{ip}:9000")
    # 注意：生产环境请使用 uvicorn 命令行启动，这里仅为方便测试
    uvicorn.run(app, host="0.0.0.0", port=9000, log_level="info")