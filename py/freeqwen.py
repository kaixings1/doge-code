from openai import OpenAI

client = OpenAI(
    api_key="ms-e0186609-9d27-4542-a733-4cf18b89c9dd",  # 请替换成您的ModelScope Access Token
    base_url="https://api-inference.modelscope.cn/v1/"
)

response = client.chat.completions.create(
    model="Qwen/Qwen3.5-27B",
    messages=[{"role": "user", "content": "hello"}],
    stream=True
)
for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")