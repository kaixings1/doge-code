import json
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
import asyncio

app = FastAPI()

# 火山引擎配置
VOLC_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
VOLC_API_KEY = "32beae4d-507e-44d5-80a8-4e29a735ee36"
MODEL_NAME = "deepseek-v3-2-251201"  # 或者你测试成功的模型

# 创建异步 HTTP 客户端
client = httpx.AsyncClient(timeout=60.0)

@app.post("/v1/messages")
async def messages_endpoint(request: Request):
    """
    接收 Claude Code 的请求，转换为 OpenAI 格式，转发给火山引擎
    """
    body = await request.json()
    
    # 1. 提取 Claude 格式的关键字段
    messages = body.get("messages", [])
    system = body.get("system", "")
    stream = body.get("stream", False)
    max_tokens = body.get("max_tokens", 4096)
    temperature = body.get("temperature", 1.0)
    
    # 2. 转换为 OpenAI 消息格式
    openai_messages = []
    if system:
        openai_messages.append({"role": "system", "content": system})
    
    for msg in messages:
        role = msg["role"]
        content = msg["content"]
        # Claude 的 content 可能是字符串或列表（多模态），这里简化处理
        if isinstance(content, list):
            # 简单提取文本部分
            text_parts = [c["text"] for c in content if c.get("type") == "text"]
            content = " ".join(text_parts) if text_parts else ""
        openai_messages.append({"role": role, "content": content})
    
    # 3. 构建 OpenAI 请求体
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
        # 处理流式响应
        return await handle_streaming(openai_payload, headers)
    else:
        # 处理非流式响应
        return await handle_non_streaming(openai_payload, headers)


async def handle_non_streaming(payload: dict, headers: dict):
    """处理非流式请求，将 OpenAI 响应转为 Claude 格式"""
    try:
        resp = await client.post(
            f"{VOLC_BASE_URL}/chat/completions",
            json=payload,
            headers=headers
        )
        resp.raise_for_status()
        data = resp.json()
        
        # 提取 OpenAI 响应内容
        assistant_content = data["choices"][0]["message"]["content"]
        
        # 构造 Claude 格式响应
        claude_response = {
            "id": data["id"],
            "type": "message",
            "role": "assistant",
            "content": [
                {
                    "type": "text",
                    "text": assistant_content
                }
            ],
            "model": data["model"],
            "stop_reason": "end_turn",
            "stop_sequence": None,
            "usage": {
                "input_tokens": data["usage"]["prompt_tokens"],
                "output_tokens": data["usage"]["completion_tokens"]
            }
        }
        return JSONResponse(content=claude_response)
    
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def handle_streaming(payload: dict, headers: dict):
    """处理流式请求，将 OpenAI SSE 流转换为 Claude 流格式"""
    async def generate():
        async with client.stream(
            "POST",
            f"{VOLC_BASE_URL}/chat/completions",
            json=payload,
            headers=headers
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data_str = line[6:]  # 去掉 "data: " 前缀
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk["choices"][0]["delta"]
                        content = delta.get("content", "")
                        if content:
                            # 构造 Claude 流式事件格式
                            claude_chunk = {
                                "type": "content_block_delta",
                                "index": 0,
                                "delta": {
                                    "type": "text_delta",
                                    "text": content
                                }
                            }
                            yield f"data: {json.dumps(claude_chunk)}\n\n"
                    except json.JSONDecodeError:
                        continue
            # 发送结束事件
            yield f"data: {json.dumps({'type': 'message_stop'})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/v1/models")
async def models_endpoint():
    """Claude Code 可能会请求模型列表，返回一个简单的模型信息"""
    return JSONResponse(content={
        "object": "list",
        "data": [
            {
                "id": MODEL_NAME,
                "object": "model",
                "created": 1677610602,
                "owned_by": "volcano"
            }
        ]
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=9000)