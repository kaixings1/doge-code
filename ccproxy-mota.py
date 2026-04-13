import httpx
import asyncio
import logging
import json
import os
import socket
import time
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
timecounts = 3;

# ================== 日志配置 ==================
VERBOSE_LOG = True  # 设为 False 可关闭详细日志，只保留关键信息
COUNTER_FILE = "usage_count.json"
counter_lock = asyncio.Lock()
total_requests = 0
total_requests = 0

def load_counter():
    """从文件加载计数，若文件不存在则返回0"""
    if os.path.exists(COUNTER_FILE):
        try:
            with open(COUNTER_FILE, 'r') as f:
                data = json.load(f)
                return data.get("total_requests", 0)
        except:
            return 0
    return 0

def save_counter(count):
    """保存计数到文件"""
    with open(COUNTER_FILE, 'w') as f:
        json.dump({"total_requests": count, "last_updated": time.strftime("%Y-%m-%d %H:%M:%S")}, f)

async def increment_counter():
    """异步安全地增加计数并保存"""
    global total_requests
    async with counter_lock:
        total_requests += 1
        save_counter(total_requests)
        logger.info(f"📊 Request count incremented. Total: {total_requests}")

# ================== 启动时的交互 ==================
def startup_interaction():
    global total_requests
    total_requests = load_counter()
    print(f"\n📊 当前累计调用次数: {total_requests}")
    choice = input("是否将计数器清零？(y/n): ").strip().lower()
    if choice == 'y':
        total_requests = 0
        save_counter(0)
        print("✅ 计数器已清零。")
    else:
        print("✅ 继续累计计数。")
    print("=" * 50)

    
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("modelscope-proxy")

# 如果开启详细日志，将 httpx 的日志级别也设为 INFO
if VERBOSE_LOG:
    logging.getLogger("httpx").setLevel(logging.INFO)

app = FastAPI()
import time

@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Incoming request: {request.method} {request.url.path}")
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    logger.info(f"Response status: {response.status_code} completed in {process_time:.3f}s")
    return response

# ================== ModelScope 配置 ==================
MODELSCOPE_BASE_URL = "https://api-inference.modelscope.cn/v1"
MODELSCOPE_API_KEY = "ms-e0186609-9d27-4542-a733-4cf18b89c9dd"

# ================== 多模型配置（按优先级排序） ==================
MODELS_LIST = [    
    "deepseek-ai/DeepSeek-V3.2",
    "Qwen/Qwen3.5-397B-A17B",
    "Qwen/Qwen3-32B",
    "XiaomiMiMo/MiMo-V2-Flash",
    "Qwen/Qwen3-8B",
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
    "Qwen/Qwen3-32B",
    "baichuan-inc/Baichuan2-13B-Chat",
    "01-ai/Yi-34B-Chat",
    "hfl/chinese-llama-2-7b"
]
# ====================================================

client = httpx.AsyncClient(timeout=120.0)

def mask_api_key(key: str) -> str:
    if len(key) > 8:
        return key[:4] + "****" + key[-4:]
    return "***"

def truncate_text(text: str, max_len: int = 1500) -> str:
    """截断过长的文本，用于日志"""
    if len(text) <= max_len:
        return text
    return text[:max_len] + f"...[truncated, total {len(text)} chars]"

    """格式化打印消息列表"""
def pretty_print_messages(messages):
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

async def request_with_retry(method, url, **kwargs):
    """自动重试 429 错误（指数退避），并打印请求/响应详情"""
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
            wait = 2 ** attempt
            logger.warning(f"Rate limited (429), retrying after {wait}s...")
            await asyncio.sleep(wait)
            continue
        if resp.status_code >= 400:
            error_text = await resp.aread()
            logger.error(f"Error response body: {error_text.decode()}")
        resp.raise_for_status()
        return resp
    raise Exception("Max retries exceeded for 429 (quota exhausted)")

def build_models_to_try(requested_model: str = None):
    """构造要尝试的模型列表，优先使用请求中指定的模型，然后使用配置列表（去重）"""
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

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    try:
        body = await request.json()
        logger.info(f"Received /v1/chat/completions request, stream={body.get('stream')}")
        if VERBOSE_LOG and "messages" in body and body["messages"] is not None:
            # 确保 messages 是列表
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
    await asyncio.sleep(5)
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
                    time.sleep(timecounts)
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
                        await increment_counter()
                        # 成功：直接转发原始字节流
                        async for chunk in resp.aiter_bytes():
                            if VERBOSE_LOG:
                                chunk_str = chunk.decode('utf-8', errors='replace')
                                # 打印流式数据的前200字符
                                logger.debug(f"📤 Remote stream chunk: {truncate_text(chunk_str, 200)}")
                            yield chunk
                        return
                except Exception as e:
                    logger.error(f"Exception with model {model_name}: {e}")
                    last_error = str(e)
                    continue
            # 所有模型都失败
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
            try:
                resp = await request_with_retry(
                    "POST",
                    f"{MODELSCOPE_BASE_URL}/chat/completions",
                    json=body,
                    headers=headers
                )
                response_json = resp.json()
                logger.info(f"Success with model {model_name}, usage={response_json.get('usage')}")
                if resp.status_code == 200:
                    await increment_counter()
                if VERBOSE_LOG:
                    # 打印远端返回的原始响应摘要
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

@app.post("/v1/messages")
async def messages(request: Request):
    """将 Anthropic /v1/messages 转换为 OpenAI 格式，后端调用 ModelScope，支持多模型自动切换"""
    body = await request.json()
    logger.info(f"Received /v1/messages request, stream={body.get('stream')}")
    
    # 打印原始请求中的用户消息
    if VERBOSE_LOG:
        if "messages" in body:
            logger.info("📥 Local input messages (Anthropic format):\n" + pretty_print_messages(body["messages"]))
        if "system" in body and body["system"]:
            logger.info(f"📥 System prompt: {truncate_text(body['system'], 300)}")
    
    messages_list = body.get("messages", [])
    system = body.get("system", "")
    stream = body.get("stream", True)
    max_tokens = body.get("max_tokens", 4096)
    temperature = body.get("temperature", 1.0)

    # 转换为 OpenAI 消息格式
    openai_messages = []
    if system:
        openai_messages.append({"role": "system", "content": system})
    for msg in messages_list:
        role = msg["role"]
        content = msg["content"]
        if isinstance(content, list):
            texts = [c["text"] for c in content if c.get("type") == "text"]
            content = " ".join(texts) if texts else ""
        openai_messages.append({"role": role, "content": content})
    
    if VERBOSE_LOG:
        logger.info("🔄 Converted to OpenAI messages:\n" + pretty_print_messages(openai_messages))

    models_to_try = build_models_to_try(None)
    if not models_to_try:
        models_to_try = MODELS_LIST.copy()
    logger.info(f"Will try models in order: {models_to_try}")
    await asyncio.sleep(5)
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {MODELSCOPE_API_KEY}"
    }

    if stream:
        async def stream_generate():
            last_error = None
            for idx, model_name in enumerate(models_to_try):
                openai_payload = {
                    "model": model_name,
                    "messages": openai_messages,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "stream": True,
                }
                logger.info(f"Attempting stream with model {model_name} ({idx+1}/{len(models_to_try)})")
                try:
                    time.sleep(timecounts)
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
                        
                        async for line in resp.aiter_lines():
                            if line.startswith("data: "):
                                data_str = line[6:]
                                if data_str == "[DONE]":
                                    break
                                try:
                                    chunk = json.loads(data_str)
                                    if "error" in chunk:
                                        logger.error(f"ModelScope returned error chunk: {chunk['error']}")
                                        error_event = {
                                            "type": "error",
                                            "error": {"type": "api_error", "message": chunk["error"].get("message", "Unknown error")}
                                        }
                                        yield f"data: {json.dumps(error_event)}\n\n"
                                        break
                                    
                                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                                    content = delta.get("content", "")
                                    if content and VERBOSE_LOG:
                                        logger.debug(f"📤 Remote stream delta: {truncate_text(content, 200)}")
                                    if content:
                                        claude_chunk = {
                                            "type": "content_block_delta",
                                            "index": 0,
                                            "delta": {"type": "text_delta", "text": content}
                                        }
                                        yield f"data: {json.dumps(claude_chunk)}\n\n"
                                except json.JSONDecodeError:
                                    logger.warning(f"Failed to parse chunk: {data_str}")
                                    continue
                        yield f"data: {json.dumps({'type': 'message_stop'})}\n\n"
                        return
                except Exception as e:
                    logger.error(f"Exception with model {model_name}: {e}")
                    last_error = str(e)
                    continue
            # 所有模型都失败
            error_event = {
                "type": "error",
                "error": {"message": f"All models failed. Last error: {last_error}"}
            }
            yield f"data: {json.dumps(error_event)}\n\n"
            yield f"data: {json.dumps({'type': 'message_stop'})}\n\n"
        
        return StreamingResponse(stream_generate(), media_type="text/event-stream")

    else:
        last_exception = None
        for idx, model_name in enumerate(models_to_try):
            openai_payload = {
                "model": model_name,
                "messages": openai_messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "stream": False,
            }
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

                choices = data.get("choices")
                if not choices or not isinstance(choices, list) or len(choices) == 0:
                    logger.error(f"Model {model_name} invalid response: missing choices")
                    last_exception = Exception("Missing choices")
                    continue

                choice = choices[0]
                if "message" not in choice or "content" not in choice["message"]:
                    logger.error(f"Model {model_name} missing message.content")
                    last_exception = Exception("Missing content")
                    continue

                assistant_content = choice["message"]["content"]
                claude_response = {
                    "id": data.get("id", "unknown"),
                    "type": "message",
                    "role": "assistant",
                    "content": [{"type": "text", "text": assistant_content}],
                    "model": data.get("model", model_name),
                    "stop_reason": "end_turn",
                    "stop_sequence": None,
                    "usage": {
                        "input_tokens": data.get("usage", {}).get("prompt_tokens", 0),
                        "output_tokens": data.get("usage", {}).get("completion_tokens", 0)
                    }
                }
                logger.info(f"Success with model {model_name}, tokens: {claude_response['usage']}")
                if VERBOSE_LOG:
                    logger.info(f"📥 Remote response content: {truncate_text(assistant_content, 500)}")
                    logger.info(f"📤 Returning to local: {truncate_text(json.dumps(claude_response, ensure_ascii=False), 500)}")
                return JSONResponse(content=claude_response)

            except Exception as e:
                logger.warning(f"Model {model_name} failed: {e}")
                last_exception = e
                continue

        logger.error("All models failed")
        return JSONResponse(content={"type": "error", "error": {"message": f"All models failed. Last error: {last_exception}"}}, status_code=500)

@app.get("/v1/models")
async def models():
    logger.info("Models list requested")
    return JSONResponse(content={
        "object": "list",
        "data": [{"id": m, "object": "model", "created": 1677610602, "owned_by": "modelscope"} for m in MODELS_LIST]
    })@app.post("/v1/messages")
async def messages(request: Request):
    """将 Anthropic /v1/messages 转换为 OpenAI 格式，支持 tools 和 tool_calls 双向转换"""
    body = await request.json()
    logger.info(f"Received /v1/messages request, stream={body.get('stream')}")
    
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
    tool_choice = body.get("tool_choice", None)  # Anthropic 的 tool_choice 可以是 {"type": "auto"} 或 {"type": "any"} 等

    # 转换消息格式（Anthropic -> OpenAI）
    openai_messages = []
    if system:
        openai_messages.append({"role": "system", "content": system})
    for msg in messages_list:
        role = msg["role"]
        content = msg["content"]
        if isinstance(content, list):
            # 处理可能存在的 tool_result 等（这里简化，只取 text）
            texts = []
            for c in content:
                if c.get("type") == "text":
                    texts.append(c["text"])
                elif c.get("type") == "tool_result":
                    # 工具结果也是文本形式，直接加入
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
            # 指定具体工具
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

    # ================== 非流式处理 ==================
    if not stream:
        last_exception = None
        for idx, model_name in enumerate(models_to_try):
            openai_payload = {
                "model": model_name,
                "messages": openai_messages,
                "max_tokens": max_tokens,
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

    # ================== 流式处理 ==================
    else:
        async def stream_generate():
            last_error = None
            # 流式状态机：用于处理 tool_calls 的增量
            # 格式: { index: { "id": str, "name": str, "arguments": str } }
            tool_call_buffers = {}
            current_text = ""
            max_tokens = body.get("max_tokens", 4096)
            # 限制最大为 16384，避免某些模型不支持
            MAX_ALLOWED_TOKENS = 16384
            if max_tokens > MAX_ALLOWED_TOKENS:
                logger.warning(f"max_tokens {max_tokens} exceeds limit, clamping to {MAX_ALLOWED_TOKENS}")
                max_tokens = MAX_ALLOWED_TOKENS    
            for idx, model_name in enumerate(models_to_try):
                openai_payload = {
                    "model": model_name,
                    "messages": openai_messages,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "stream": True,
                }
                if openai_tools:
                    openai_payload["tools"] = openai_tools
                if openai_tool_choice:
                    openai_payload["tool_choice"] = openai_tool_choice

                logger.info(f"Attempting stream with model {model_name} ({idx+1}/{len(models_to_try)})")
                try:
                    time.sleep(timecounts)
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

                        # 重置流式状态
                        tool_call_buffers.clear()
                        current_text = ""

                        async for line in resp.aiter_lines():
                            if not line.startswith("data: "):
                                continue
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                # 结束所有未完成的 tool_use 块
                                for idx, buf in tool_call_buffers.items():
                                    if buf["arguments"]:
                                        # 发送 content_block_stop
                                        yield f"data: {json.dumps({'type': 'content_block_stop', 'index': idx})}\n\n"
                                # 发送 message_stop
                                yield f"data: {json.dumps({'type': 'message_stop'})}\n\n"
                                return

                            try:
                                chunk = json.loads(data_str)
                                if "error" in chunk:
                                    logger.error(f"ModelScope error chunk: {chunk['error']}")
                                    error_event = {
                                        "type": "error",
                                        "error": {"type": "api_error", "message": chunk["error"].get("message", "Unknown error")}
                                    }
                                    yield f"data: {json.dumps(error_event)}\n\n"
                                    break

                                delta = chunk.get("choices", [{}])[0].get("delta", {})
                                # 处理文本增量
                                if "content" in delta and delta["content"]:
                                    current_text += delta["content"]
                                    yield f"data: {json.dumps({'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'text_delta', 'text': delta['content']}})}\n\n"

                                # 处理工具调用增量
                                if "tool_calls" in delta:
                                    for tc_delta in delta["tool_calls"]:
                                        idx_tool = tc_delta.get("index", 0)
                                        # 如果是新工具调用，先发送 content_block_start
                                        if idx_tool not in tool_call_buffers:
                                            # 从第一个 chunk 中获取 id 和 name（OpenAI 只在第一个 delta 中有）
                                            tc_id = tc_delta.get("id", f"call_{idx_tool}")
                                            tc_name = tc_delta.get("function", {}).get("name", "")
                                            tool_call_buffers[idx_tool] = {"id": tc_id, "name": tc_name, "arguments": ""}
                                            # 发送 content_block_start
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
                                        # 累积 arguments
                                        if "function" in tc_delta and "arguments" in tc_delta["function"]:
                                            args_delta = tc_delta["function"]["arguments"]
                                            tool_call_buffers[idx_tool]["arguments"] += args_delta
                                            # 发送 content_block_delta (tool_use 的 input 增量)
                                            yield f"data: {json.dumps({'type': 'content_block_delta', 'index': idx_tool, 'delta': {'type': 'input_json_delta', 'partial_json': args_delta}})}\n\n"

                            except json.JSONDecodeError:
                                logger.warning(f"Failed to parse chunk: {data_str}")
                                continue

                        # 如果循环正常结束但没有收到 [DONE]（异常情况），发送停止事件
                        yield f"data: {json.dumps({'type': 'message_stop'})}\n\n"
                        return

                except Exception as e:
                    logger.error(f"Exception with model {model_name}: {e}")
                    last_error = str(e)
                    continue

            # 所有模型都失败
            error_event = {
                "type": "error",
                "error": {"message": f"All models failed. Last error: {last_error}"}
            }
            yield f"data: {json.dumps(error_event)}\n\n"
            yield f"data: {json.dumps({'type': 'message_stop'})}\n\n"

        return StreamingResponse(stream_generate(), media_type="text/event-stream")

import socket
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

if __name__ == "__main__":
    startup_interaction()
    import uvicorn
    print("Proxy running on:")
    for ip in get_local_ips():
        print(f"  http://{ip}:9000")
    uvicorn.run(app, host="127.0.0.1", port=9000, log_level="info")