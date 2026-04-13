import httpx
import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
import json

app = FastAPI()

VOLC_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
VOLC_API_KEY = "32beae4d-507e-44d5-80a8-4e29a735ee36"
MODEL_NAME = "deepseek-v3-2-251201"

client = httpx.AsyncClient(timeout=120.0)

async def request_with_retry(method, url, **kwargs):
    """自动重试 429 错误（指数退避）"""
    max_retries = 3
    for attempt in range(max_retries):
        resp = await client.request(method, url, **kwargs)
        if resp.status_code == 429:
            wait = 2 ** attempt
            await asyncio.sleep(wait)
            continue
        resp.raise_for_status()
        return resp
    raise Exception("Max retries exceeded for 429")

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()
    if not body.get("model"):
        body["model"] = MODEL_NAME
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {VOLC_API_KEY}"
    }
    if body.get("stream"):
        async def stream_generate():
            async with client.stream("POST", f"{VOLC_BASE_URL}/chat/completions", json=body, headers=headers) as resp:
                if resp.status_code == 429:
                    yield f"data: {json.dumps({'error': 'Rate limit exceeded'})}\n\n"
                    return
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes():
                    yield chunk
        return StreamingResponse(stream_generate(), media_type="text/event-stream")
    else:
        resp = await request_with_retry("POST", f"{VOLC_BASE_URL}/chat/completions", json=body, headers=headers)
        return JSONResponse(content=resp.json())

@app.post("/v1/messages")
async def messages(request: Request):
    """将 Anthropic /v1/messages 转换为 OpenAI 格式"""
    body = await request.json()
    messages = body.get("messages", [])
    system = body.get("system", "")
    stream = body.get("stream", False)
    max_tokens = body.get("max_tokens", 4096)
    temperature = body.get("temperature", 1.0)
    
    openai_messages = []
    if system:
        openai_messages.append({"role": "system", "content": system})
    for msg in messages:
        role = msg["role"]
        content = msg["content"]
        if isinstance(content, list):
            texts = [c["text"] for c in content if c.get("type") == "text"]
            content = " ".join(texts) if texts else ""
        openai_messages.append({"role": role, "content": content})
    
    openai_payload = {
        "model": MODEL_NAME,
        "messages": openai_messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": stream,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {VOLC_API_KEY}"
    }
    
    if stream:
        async def stream_generate():
            async with client.stream("POST", f"{VOLC_BASE_URL}/chat/completions", json=openai_payload, headers=headers) as resp:
                if resp.status_code == 429:
                    yield f"data: {json.dumps({'type': 'error', 'error': 'Rate limit exceeded'})}\n\n"
                    return
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            delta = chunk["choices"][0]["delta"]
                            content = delta.get("content", "")
                            if content:
                                claude_chunk = {
                                    "type": "content_block_delta",
                                    "index": 0,
                                    "delta": {"type": "text_delta", "text": content}
                                }
                                yield f"data: {json.dumps(claude_chunk)}\n\n"
                        except:
                            continue
                yield f"data: {json.dumps({'type': 'message_stop'})}\n\n"
        return StreamingResponse(stream_generate(), media_type="text/event-stream")
    else:
        resp = await request_with_retry("POST", f"{VOLC_BASE_URL}/chat/completions", json=openai_payload, headers=headers)
        data = resp.json()
        assistant_content = data["choices"][0]["message"]["content"]
        claude_response = {
            "id": data["id"],
            "type": "message",
            "role": "assistant",
            "content": [{"type": "text", "text": assistant_content}],
            "model": data["model"],
            "stop_reason": "end_turn",
            "stop_sequence": None,
            "usage": {
                "input_tokens": data["usage"]["prompt_tokens"],
                "output_tokens": data["usage"]["completion_tokens"]
            }
        }
        return JSONResponse(content=claude_response)

@app.get("/v1/models")
async def models():
    return JSONResponse(content={
        "object": "list",
        "data": [{"id": MODEL_NAME, "object": "model", "created": 1677610602, "owned_by": "volcano"}]
    })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=9000)