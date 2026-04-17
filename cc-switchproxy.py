from flask import Flask, request, Response, jsonify
import requests
import json

app = Flask(__name__)

BACKEND_URL = "http://127.0.0.1:8081"
DEFAULT_MODEL = "qwen3.5:4b-120k"

MODEL_MAP = {
    "qwen2.5-coder:1.5b": DEFAULT_MODEL,
    "hands/qwen2.5-coder:1.5b": DEFAULT_MODEL,
    "claude-3-opus": DEFAULT_MODEL,
    "claude-3-sonnet": DEFAULT_MODEL,
    "claude-3-haiku": DEFAULT_MODEL,
}

@app.route('/', defaults={'path': ''}, methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
@app.route('/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
def catch_all(path):
    print(f"=== {request.method} {request.path} ===")

    if request.method == 'OPTIONS':
        resp = Response()
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return resp

    # 内部端点
    if '/api/claude_cli/bootstrap' in request.path:
        return jsonify({"status": "ok", "user": {"id": "local"}})
    if '/api/telemetry' in request.path or '/api/events' in request.path:
        return jsonify({"status": "ok"})

    # 关键：处理 POST / 的聊天请求
    if request.method == 'POST' and request.path == '/':
        data = request.get_json() or {}
        if 'messages' in data:
            print("Detected chat request on /, forwarding...")
            return handle_chat_request(request)
        else:
            print("POST / but no messages field, returning mock")
            return jsonify({"status": "ok"})

    # 标准路径
    if request.path in ('/v1/messages', '/v1/chat/completions') and request.method == 'POST':
        return handle_chat_request(request)

    print(f"Unhandled endpoint: {request.path}, returning 200 mock")
    return jsonify({"status": "ok", "message": "mock response"})

def handle_chat_request(req):
    data = req.get_json() or {}
    claude_model = data.get('model', DEFAULT_MODEL)
    target_model = MODEL_MAP.get(claude_model, DEFAULT_MODEL)
    messages = data.get('messages', [])

    openai_payload = {
        "model": target_model,
        "messages": messages,
        "stream": False,
        "max_tokens": 4096,
        "temperature": 0.7,
    }

    headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dummy'
    }

    try:
        target_url = f"{BACKEND_URL}/v1/chat/completions"
        resp = requests.post(target_url, json=openai_payload, headers=headers, timeout=120)
        if resp.status_code != 200:
            return jsonify({"error": f"Backend error: {resp.text}"}), 502

        oai_json = resp.json()
        # 提取文本内容
        if 'choices' in oai_json and len(oai_json['choices']) > 0:
            content = oai_json['choices'][0].get('message', {}).get('content', '')
        else:
            content = ''

        if not content:
            return jsonify({"error": "No output in response"}), 422

        # 转换为 Anthropic 格式
        anthropic_response = {
            "id": oai_json.get('id', 'msg_123'),
            "type": "message",
            "role": "assistant",
            "content": [{"type": "text", "text": content}],
            "model": claude_model,
            "stop_reason": oai_json['choices'][0].get('finish_reason', 'stop'),
            "usage": oai_json.get('usage', {})
        }
        return jsonify(anthropic_response)
    except Exception as e:
        print(f"Exception: {e}")
        return jsonify({"error": str(e)}), 502

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9000, debug=False)