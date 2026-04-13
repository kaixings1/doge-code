import httpx
import asyncio
import logging
import json
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse

# ================== 日志配置 ==================
VERBOSE_LOG = True  # 设为 False 可关闭详细日志，只保留关键信息

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
    "Qwen/Qwen3.5-397B-A17B",
    "deepseek-ai/DeepSeek-V3.2",
    "Qwen/Qwen2.5-72B-Instruct",  
    "MiniMax/MiniMax-M2.5",
    "Qwen/Qwen2.5-32B-Instruct",
    "Qwen/Qwen2.5-14B-Instruct",
    "Qwen/Qwen2.5-7B-Instruct",
    "ZhipuAI/glm-4-9b-chat",
    "internlm/internlm2_5-7b-chat",
    "THUDM/glm-4-9b-chat",
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

def truncate_text(text: str, max_len: int = 500) -> str:
    """截断过长的文本，用于日志"""
    if len(text) <= max_len:
        return text
    return text[:max_len] + f"...[truncated, total {len(text)} chars]"

def pretty_print_messages(messages):
    """格式化打印消息列表"""
    if not VERBOSE_LOG:
        return ""
    lines = []
    for msg in messages:
        role = msg.get("role", "unknown")
        content = msg.get("content", "")
        if isinstance(content, list):
            # 处理 content 为列表的情况（如原始 Anthropic 格式）
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
        # 打印用户输入内容（消息）
        if VERBOSE_LOG and "messages" in body:
            logger.info("📥 Local input messages:\n" + pretty_print_messages(body["messages"]))
    except Exception as e:
        logger.error(f"Invalid JSON: {e}")
        return JSONResponse(content={"error": f"Invalid JSON: {str(e)}"}, status_code=400)

    requested_model = body.get("model")
    models_to_try = build_models_to_try(requested_model)
    if not models_to_try:
        models_to_try = MODELS_LIST.copy()
    logger.info(f"Will try models in order: {models_to_try}")

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
    stream = body.get("stream", False)
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
                                        continue
                                    
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
    })

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
    import uvicorn
    print("Proxy running on:")
    for ip in get_local_ips():
        print(f"  http://{ip}:9000")
    uvicorn.run(app, host="0.0.0.0", port=9000, log_level="info")