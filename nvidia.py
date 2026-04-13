#!/usr/bin/env python3
"""
NVIDIA NIM API 多模型代理服务
支持 OpenAI 和 Anthropic 格式请求，自动 fallback，支持 tools/流式
"""

import os
import json
import asyncio
import logging
import time
from typing import Optional, List, Dict, Any

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse

# ================== 配置区域 ==================
VERBOSE_LOG = True  # 是否打印详细日志
DEFAULT_TIMEOUT = 180.0  # 总请求超时（秒），大模型冷启动可能较慢
MODEL_SWITCH_DELAY = 3   # 切换模型前的等待秒数（避免速率限制）

# NVIDIA NIM 配置
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY")
if not NVIDIA_API_KEY:
    raise RuntimeError("请设置环境变量 NVIDIA_API_KEY")

# 模型优先级列表（名称务必与 NVIDIA 返回的 id 完全一致）
# 可从 GET /v1/models 获取完整列表，这里给出常用模型
MODELS_LIST = [
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
    "moonshotai/kimi-k2-instruct",
    "qwen/qwen3-32b",
    "qwen/qwen3-8b",
    "google/gemma-2-9b-it",
]

# ================== 日志初始化 ==================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("nvidia-proxy")
if VERBOSE_LOG:
    logging.getLogger("httpx").setLevel(logging.INFO)

# ================== FastAPI 应用 ==================
app = FastAPI(title="NVIDIA NIM Proxy")
client = httpx.AsyncClient(timeout=DEFAULT_TIMEOUT)


# ================== 工具函数 ==================
def mask_api_key(key: str) -> str:
    """遮蔽 API Key 用于日志"""
    if len(key) > 8:
        return key[:4] + "****" + key[-4:]
    return "***"

def truncate_text(text: str, max_len: int = 500) -> str:
    """截断长文本用于日志"""
    if len(text) <= max_len:
        return text
    return text[:max_len] + f"...[truncated, total {len(text)} chars]"

def pretty_print_messages(messages: List[Dict]) -> str:
    """格式化打印消息列表"""
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
        lines.append(f"  {role}: {truncate_text(str(content), 300)}")
    return "\n".join(lines)

async def request_with_retry(method: str, url: str, **kwargs) -> httpx.Response:
    """
    发送 HTTP 请求，自动重试 429 错误，并打印调试日志。
    """
    max_retries = 3
    headers_safe = {
        k: mask_api_key(v) if k.lower() == "authorization" else v
        for k, v in kwargs.get("headers", {}).items()
    }
    logger.info(f"Request: {method} {url} | Headers: {headers_safe}")
    if "json" in kwargs:
        body_str = json.dumps(kwargs["json"], ensure_ascii=False)
        logger.info(f"Request body: {truncate_text(body_str, 500)}")

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
    raise Exception("Max retries exceeded for 429")


# ================== 模型 Fallback 逻辑 ==================
def build_models_to_try(requested_model: Optional[str] = None) -> List[str]:
    """
    构造要尝试的模型列表：
    1. 如果请求指定了模型且不在默认列表中，将其放在最前面
    2. 然后拼接默认列表（去重）
    """
    models = []
    if requested_model and requested_model not in MODELS_LIST:
        models.append(requested_model)
    models.extend([m for m in MODELS_LIST if m != requested_model])
    # 去重保持顺序
    seen = set()
    unique_models = []
    for m in models:
        if m not in seen:
            seen.add(m)
            unique_models.append(m)
    return unique_models


# ================== 请求日志中间件 ==================
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Incoming: {request.method} {request.url.path}")
    start = time.time()
    response = await call_next(request)
    elapsed = time.time() - start
    logger.info(f"Response: {response.status_code} in {elapsed:.3f}s")
    return response


# ================== 模型列表接口 ==================
@app.get("/v1/models")
async def list_models():
    """返回当前配置的可用模型列表（OpenAI 格式）"""
    return {
        "object": "list",
        "data": [
            {
                "id": m,
                "object": "model",
                "created": 1677610602,
                "owned_by": "nvidia"
            }
            for m in MODELS_LIST
        ]
    }


# ================== OpenAI 格式端点 ==================
@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """
    OpenAI 兼容的聊天补全端点，支持流式和非流式，自动 fallback 模型。
    """
    try:
        body = await request.json()
        logger.info(f"Received /v1/chat/completions, stream={body.get('stream')}")
        if VERBOSE_LOG and "messages" in body:
            logger.info("📥 Input messages:\n" + pretty_print_messages(body["messages"]))
    except Exception as e:
        logger.error(f"Invalid JSON: {e}")
        return JSONResponse({"error": f"Invalid JSON: {str(e)}"}, status_code=400)

    requested_model = body.get("model")
    models_to_try = build_models_to_try(requested_model)
    logger.info(f"Models to try (in order): {models_to_try}")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {NVIDIA_API_KEY}"
    }

    # 非流式处理
    if not body.get("stream", False):
        last_exception = None
        for idx, model_name in enumerate(models_to_try):
            body["model"] = model_name
            logger.info(f"Attempting non-stream with {model_name} ({idx+1}/{len(models_to_try)})")
            try:
                resp = await request_with_retry(
                    "POST",
                    f"{NVIDIA_BASE_URL}/chat/completions",
                    json=body,
                    headers=headers
                )
                data = resp.json()
                logger.info(f"Success with {model_name}, usage={data.get('usage')}")
                if VERBOSE_LOG:
                    choices = data.get("choices", [])
                    if choices:
                        content = choices[0].get("message", {}).get("content", "")
                        logger.info(f"📥 Response content preview: {truncate_text(content, 300)}")
                return JSONResponse(content=data)
            except Exception as e:
                logger.warning(f"Model {model_name} failed: {e}")
                last_exception = e
                await asyncio.sleep(MODEL_SWITCH_DELAY)
                continue

        logger.error("All models failed")
        return JSONResponse(
            {"error": f"All models failed. Last error: {last_exception}"},
            status_code=500
        )

    # 流式处理
    async def stream_generator():
        last_error = None
        for idx, model_name in enumerate(models_to_try):
            body["model"] = model_name
            logger.info(f"Attempting stream with {model_name} ({idx+1}/{len(models_to_try)})")
            try:
                await asyncio.sleep(MODEL_SWITCH_DELAY)
                async with client.stream(
                    "POST",
                    f"{NVIDIA_BASE_URL}/chat/completions",
                    json=body,
                    headers=headers
                ) as resp:
                    if resp.status_code != 200:
                        error_body = await resp.aread()
                        error_msg = error_body.decode()
                        logger.error(f"Model {model_name} error {resp.status_code}: {error_msg}")
                        if resp.status_code == 429:
                            last_error = error_msg
                            continue
                        # 非 429 错误直接返回错误事件
                        yield f"data: {json.dumps({'error': {'message': f'NVIDIA error {resp.status_code}: {error_msg}', 'type': 'api_error'}})}\n\n"
                        yield "data: [DONE]\n\n"
                        return

                    # 成功获取流，转发数据
                    async for chunk in resp.aiter_bytes():
                        if VERBOSE_LOG:
                            chunk_str = chunk.decode('utf-8', errors='replace')
                            logger.debug(f"📤 Stream chunk: {truncate_text(chunk_str, 200)}")
                        yield chunk
                    return  # 成功则结束

            except Exception as e:
                logger.error(f"Exception with {model_name}: {e}")
                last_error = str(e)
                continue

        # 所有模型都失败
        yield f"data: {json.dumps({'error': {'message': f'All models failed. Last error: {last_error}', 'type': 'all_failed'}})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")


# ================== Anthropic 格式端点 ==================
@app.post("/v1/messages")
async def messages_endpoint(request: Request):
    """
    Anthropic 兼容的消息端点，自动转换为 OpenAI 格式，支持 tools 和流式。
    """
    try:
        body = await request.json()
        logger.info(f"Received /v1/messages, stream={body.get('stream')}")
        if VERBOSE_LOG:
            if "messages" in body:
                logger.info("📥 Input messages (Anthropic):\n" + pretty_print_messages(body["messages"]))
            if system := body.get("system"):
                logger.info(f"📥 System prompt: {truncate_text(system, 300)}")
    except Exception as e:
        logger.error(f"Invalid JSON: {e}")
        return JSONResponse({"type": "error", "error": {"message": f"Invalid JSON: {str(e)}"}}, status_code=400)

    # 提取参数
    messages_list = body.get("messages", [])
    system = body.get("system", "")
    stream = body.get("stream", False)
    max_tokens = min(body.get("max_tokens", 4096), 16384)  # NVIDIA 常见上限
    temperature = body.get("temperature", 1.0)
    anthropic_tools = body.get("tools", [])
    tool_choice = body.get("tool_choice", None)

    # 转换消息为 OpenAI 格式
    openai_messages = []
    if system:
        openai_messages.append({"role": "system", "content": system})
    for msg in messages_list:
        role = msg["role"]
        content = msg["content"]
        if isinstance(content, list):
            # 提取文本和工具结果（简化处理）
            texts = []
            for block in content:
                if block.get("type") == "text":
                    texts.append(block["text"])
                elif block.get("type") == "tool_result":
                    # 工具结果可能嵌套
                    result_content = block.get("content", "")
                    if isinstance(result_content, list):
                        for sub in result_content:
                            if sub.get("type") == "text":
                                texts.append(sub["text"])
                    else:
                        texts.append(str(result_content))
            content = " ".join(texts) if texts else ""
        openai_messages.append({"role": role, "content": content})

    if VERBOSE_LOG:
        logger.info("🔄 Converted OpenAI messages:\n" + pretty_print_messages(openai_messages))

    # 转换 tools
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
        logger.info(f"🔄 Converted {len(openai_tools)} tools to OpenAI format")

    # 转换 tool_choice
    openai_tool_choice = "auto"
    if tool_choice:
        tc_type = tool_choice.get("type")
        if tc_type == "auto":
            openai_tool_choice = "auto"
        elif tc_type == "any":
            openai_tool_choice = "required"
        elif tc_type == "tool":
            openai_tool_choice = {
                "type": "function",
                "function": {"name": tool_choice.get("name")}
            }

    models_to_try = build_models_to_try(None)
    logger.info(f"Models to try: {models_to_try}")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {NVIDIA_API_KEY}"
    }

    # ========== 非流式 ==========
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
                openai_payload["tool_choice"] = openai_tool_choice

            logger.info(f"Attempting non-stream with {model_name} ({idx+1}/{len(models_to_try)})")
            try:
                resp = await request_with_retry(
                    "POST",
                    f"{NVIDIA_BASE_URL}/chat/completions",
                    json=openai_payload,
                    headers=headers
                )
                data = resp.json()
                if "error" in data:
                    raise Exception(data["error"].get("message", "Unknown error"))

                choice = data["choices"][0]
                message = choice.get("message", {})
                content_blocks = []

                # 文本内容
                if text_content := message.get("content"):
                    content_blocks.append({"type": "text", "text": text_content})

                # 工具调用
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
                    "id": data.get("id", f"msg_{int(time.time())}"),
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
                logger.info(f"Success with {model_name}, usage={claude_response['usage']}")
                if VERBOSE_LOG and text_content:
                    logger.info(f"📥 Response text: {truncate_text(text_content, 500)}")
                return JSONResponse(content=claude_response)

            except Exception as e:
                logger.warning(f"Model {model_name} failed: {e}")
                last_exception = e
                await asyncio.sleep(MODEL_SWITCH_DELAY)
                continue

        logger.error("All models failed")
        return JSONResponse(
            {"type": "error", "error": {"message": f"All models failed. Last error: {last_exception}"}},
            status_code=500
        )

    # ========== 流式 ==========
    async def anthropic_stream_generator():
        last_error = None
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
                openai_payload["tool_choice"] = openai_tool_choice

            logger.info(f"Attempting stream with {model_name} ({idx+1}/{len(models_to_try)})")
            try:
                await asyncio.sleep(MODEL_SWITCH_DELAY)
                async with client.stream(
                    "POST",
                    f"{NVIDIA_BASE_URL}/chat/completions",
                    json=openai_payload,
                    headers=headers
                ) as resp:
                    if resp.status_code != 200:
                        error_body = await resp.aread()
                        error_msg = error_body.decode()
                        logger.error(f"Model {model_name} error {resp.status_code}: {error_msg}")
                        if resp.status_code == 429:
                            last_error = error_msg
                            continue
                        yield f"event: error\ndata: {json.dumps({'error': {'message': error_msg}})}\n\n"
                        return

                    # 状态机
                    tool_call_buffers: Dict[int, Dict[str, Any]] = {}
                    current_text_index = 0
                    text_block_started = False

                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            # 结束所有未完成的块
                            for tc_idx, buf in tool_call_buffers.items():
                                yield f"event: content_block_stop\ndata: {json.dumps({'type': 'content_block_stop', 'index': tc_idx})}\n\n"
                            if text_block_started:
                                yield f"event: content_block_stop\ndata: {json.dumps({'type': 'content_block_stop', 'index': 0})}\n\n"
                            yield f"event: message_stop\ndata: {json.dumps({'type': 'message_stop'})}\n\n"
                            return

                        try:
                            chunk = json.loads(data_str)
                            if "error" in chunk:
                                raise Exception(chunk["error"].get("message", "Unknown error"))

                            delta = chunk.get("choices", [{}])[0].get("delta", {})

                            # 文本增量
                            if "content" in delta and delta["content"]:
                                if not text_block_started:
                                    text_block_started = True
                                    yield f"event: content_block_start\ndata: {json.dumps({'type': 'content_block_start', 'index': 0, 'content_block': {'type': 'text', 'text': ''}})}\n\n"
                                yield f"event: content_block_delta\ndata: {json.dumps({'type': 'content_block_delta', 'index': 0, 'delta': {'type': 'text_delta', 'text': delta['content']}})}\n\n"

                            # 工具调用增量
                            if "tool_calls" in delta:
                                for tc_delta in delta["tool_calls"]:
                                    idx_tool = tc_delta.get("index", 0)
                                    if idx_tool not in tool_call_buffers:
                                        # 新工具调用开始
                                        tc_id = tc_delta.get("id", f"call_{idx_tool}")
                                        tc_name = tc_delta.get("function", {}).get("name", "")
                                        tool_call_buffers[idx_tool] = {"id": tc_id, "name": tc_name, "arguments": ""}
                                        yield f"event: content_block_start\ndata: {json.dumps({'type': 'content_block_start', 'index': idx_tool, 'content_block': {'type': 'tool_use', 'id': tc_id, 'name': tc_name, 'input': {}}})}\n\n"
                                    if "function" in tc_delta and "arguments" in tc_delta["function"]:
                                        args_delta = tc_delta["function"]["arguments"]
                                        tool_call_buffers[idx_tool]["arguments"] += args_delta
                                        yield f"event: content_block_delta\ndata: {json.dumps({'type': 'content_block_delta', 'index': idx_tool, 'delta': {'type': 'input_json_delta', 'partial_json': args_delta}})}\n\n"

                        except json.JSONDecodeError:
                            logger.warning(f"Failed to parse chunk: {data_str}")
                            continue

                    # 如果循环结束但没收到 [DONE]（理论上不会）
                    yield f"event: message_stop\ndata: {json.dumps({'type': 'message_stop'})}\n\n"
                    return

            except Exception as e:
                logger.error(f"Exception with {model_name}: {e}")
                last_error = str(e)
                continue

        # 所有模型失败
        yield f"event: error\ndata: {json.dumps({'error': {'message': f'All models failed. Last error: {last_error}'}})}\n\n"
        yield f"event: message_stop\ndata: {json.dumps({'type': 'message_stop'})}\n\n"

    return StreamingResponse(anthropic_stream_generator(), media_type="text/event-stream")


# ================== 启动服务 ==================
if __name__ == "__main__":
    import uvicorn
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

    print("\n🚀 NVIDIA NIM Proxy running on:")
    for ip in get_local_ips():
        print(f"  http://{ip}:9000")
    print("\n✅ Endpoints:")
    print("  - /v1/chat/completions  (OpenAI)")
    print("  - /v1/messages           (Anthropic)")
    print("  - /v1/models             (list models)")
    print("\nPress Ctrl+C to stop.\n")

    uvicorn.run(app, host="0.0.0.0", port=9001, log_level="info")