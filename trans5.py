# translate_json_robust.py
import asyncio
import aiohttp
import json
import os
import re
import time
from typing import Dict, List, Optional

# ==================== 配置区域 ====================
API_URL = "http://localhost:9000/v1/chat/completions"
MODEL_NAME = "local-model"
INPUT_JSON = "./public/locales/en/translation.json"
OUTPUT_JSON = "./public/locales/zh-CN/translation.json"

CONCURRENT_REQUESTS = 1          # 并发请求数，可适当提高，但注意服务端负载
BATCH_SIZE = 10                  # 【修改1】每批翻译 50 条，大幅减少请求次数
REQUEST_TIMEOUT = 300            # 【修改2】超时增至 5 分钟，防止生成慢导致超时
MAX_RETRIES = 3
RETRY_BASE_DELAY = 2
TEMPERATURE = 0.1

# 日志开关：True 时打印完整的请求载荷和原始响应（用于调试）
DEBUG_LOG = True
# 是否打印每批次的输入输出对照
SHOW_TRANSLATION_PAIRS = True
MAX_TOKENS_LIMIT = 4096   # 最大允许的 max_tokens，防止异常增长
SYSTEM_PROMPT = """你是一个专业的前端国际化翻译专家。请将以下英文 UI 文本翻译为自然、专业的简体中文。

【核心要求】
1. 保持专业、简洁，符合中文软件界面的表达习惯。
2. 如果文本中包含占位符，如 {{name}}、%s、{0} 等，请原样保留，不要翻译。
3. 严格遵循以下术语表：
   - "Sign In" → "登录"
   - "Sign Up" → "注册"  
   - "Settings" → "设置"
   - "Account" → "账户"
   - "Dashboard" → "工作台"
   - "Submit" → "提交"
   - "Cancel" → "取消"
   - "Save" → "保存"
   - "Delete" → "删除"
   - "Edit" → "编辑"
   - "Create" → "创建"
   - "Update" → "更新"
   - "Back" → "返回"
   - "Next" → "下一步"
   - "Finish" → "完成"
   - "Yes" → "是"
   - "No" → "否"
   - "OK" → "确定"

【输出格式要求】（极其重要）
- 仅输出一个合法的 JSON 对象，key 保持不变，仅翻译 value。
- **不要输出任何推理、思考、分析过程。**
- **不要输出任何解释、备注或额外文本。**
- **不要使用 Markdown 代码围栏（例如 ```json 或 ```）。**
- **不要输出任何特殊 token，如 <|end▁of▁sentence|>、<|eot_id|>、<|im_end|> 等。**
- 如果遇到无法确定翻译的专业术语或 API 路径片段，请保留原文，不要强行翻译。

记住：你的输出必须是纯净的 JSON 对象，不含任何其他内容。"""


# ==================== 配置结束 ====================

async def wait_for_server_ready(session: aiohttp.ClientSession, max_wait: int = 120):
    start = time.time()
    while time.time() - start < max_wait:
        try:
            async with session.get("http://localhost:9000/health") as resp:
                if resp.status == 200:
                    print("✅ 服务已就绪")
                    return True
        except:
            pass
        try:
            payload = {"model": MODEL_NAME, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 1}
            async with session.post(API_URL, json=payload, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status == 200:
                    print("✅ 服务已就绪（小请求验证）")
                    return True
        except:
            pass
        print("⏳ 等待服务就绪...")
        await asyncio.sleep(5)
    print("❌ 服务未就绪，退出")
    return False

def clean_model_response(content: str) -> str:
    """
    强力清理：移除 <think> 标签、特殊 token、Markdown 围栏，并尝试提取首个合法 JSON 对象
    """
    if not content:
        return content
    # 移除 <think>...</think>
    content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL)
   # 1. 移除常见的特殊结束 token
    special_tokens = [
        '<|end▁of▁sentence|>',
        '<|endoftext|>',
        '<|eot_id|>',
        '<|im_end|>',
        '<<SYS>>',
        '<</SYS>>',
    ]
    for token in special_tokens:
        content = content.replace(token, '')
        content = content.replace(token, '')
    # 如果内容为空，直接返回
    # 2. 移除 Markdown 代码块标记
    # 提取代码块内部内容
    code_block_pattern = r'^```(?:\w+)?\s*\n(.*?)\n?```\s*$'
    match = re.search(code_block_pattern, content, re.DOTALL)
    if match:
        content = match.group(1).strip()
    else:
        # 分别移除开头和结尾的 ```
        content = re.sub(r'^```(?:\w+)?\s*\n?', '', content)
        content = re.sub(r'\n?```\s*$', '', content)

    # 3. 移除末尾可能残留的独立 ``` 行
    content = re.sub(r'\n\s*```\s*$', '', content)
    if not content.strip():
        return ""
    # 尝试提取第一个完整的 JSON 对象（从第一个 '{' 到最后一个 '}'）
    start = content.find('{')
    end = content.rfind('}')
    if start != -1 and end != -1 and end > start:
        content = content[start:end+1]
    # 移除首尾可能的空白和引号
    content = content.strip()
    if (content.startswith('"') and content.endswith('"')) or (content.startswith("'") and content.endswith("'")):
        content = content[1:-1]
    # 5. 去除首尾空白
    return content.strip()

async def translate_batch_with_retry(
    session: aiohttp.ClientSession,
    batch: Dict[str, str]
) -> Optional[Dict[str, str]]:
    """带重试的批次翻译，动态调整 max_tokens"""
    # 根据批次大小动态调整 max_tokens（粗略估计：每个条目平均 50 个输出 token）
    estimated_tokens = max(len(json.dumps(batch)) // 2, 500) + 500
    max_tokens = min(max(2048, estimated_tokens), MAX_TOKENS_LIMIT)

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(batch, ensure_ascii=False)}
        ],
        "temperature": TEMPERATURE,
        "max_tokens": max_tokens,
        "stop": ["\n\n\n"]
    }
    if DEBUG_LOG:
        print("\n" + "="*60)
        print("📤 发送请求载荷:")
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        print("="*60)

    for attempt in range(MAX_RETRIES):
        try:
            async with session.post(
                API_URL,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            ) as resp:
                data = await resp.json()
                if DEBUG_LOG:
                    print("📥 原始响应数据:")
                    print(json.dumps(data, ensure_ascii=False, indent=2))

                choices = data.get("choices", [])
                if not choices:
                    print(f"⚠️ 警告：choices 为空，响应：{data}")
                    if attempt < MAX_RETRIES - 1:
                        await asyncio.sleep(RETRY_BASE_DELAY * (2 ** attempt))
                        continue
                    return None

                content = choices[0].get("message", {}).get("content", "")
                if DEBUG_LOG:
                    print(f"📄 模型返回原始内容:\n{content}")

                cleaned = clean_model_response(content)
                if DEBUG_LOG:
                    print(f"🧹 清理后内容:\n{cleaned}")

                if not cleaned:
                    print("❌ 清理后内容为空，无法解析")
                    if attempt < MAX_RETRIES - 1:
                        await asyncio.sleep(RETRY_BASE_DELAY * (2 ** attempt))
                        continue
                    return None

                try:
                    translated = json.loads(cleaned)
                    if SHOW_TRANSLATION_PAIRS:
                        print("\n📋 本批次翻译对照：")
                        for key, zh_value in translated.items():
                            en_value = batch.get(key, '')
                            print(f"  原文: {en_value}")
                            print(f"  译文: {zh_value}")
                            print("  ──────────────────")
                    return translated
                except json.JSONDecodeError as e:
                    print(f"❌ JSON 解析失败: {e}")
                    print(f"原始响应（前 300 字符）: {cleaned[:300]}...")
                    # 打印出错位置附近内容帮助调试
                    if hasattr(e, 'pos'):
                        start = max(0, e.pos - 50)
                        end = min(len(cleaned), e.pos + 50)
                        print(f"错误位置附近: ...{cleaned[start:end]}...")
                    if attempt < MAX_RETRIES - 1:
                        await asyncio.sleep(RETRY_BASE_DELAY * (2 ** attempt))
                        continue
                    return None
        except asyncio.TimeoutError:
            print(f"⏰ 请求超时 (尝试 {attempt+1}/{MAX_RETRIES})")
        except Exception as e:
            print(f"⚠️ 网络/未知错误: {e}")
        if attempt < MAX_RETRIES - 1:
            delay = RETRY_BASE_DELAY * (2 ** attempt)
            print(f"  将在 {delay} 秒后重试...")
            await asyncio.sleep(delay)
    return None

def chunk_dict(data: Dict[str, str], chunk_size: int) -> List[Dict[str, str]]:
    """将字典切割成多个小字典"""
    items = list(data.items())
    return [dict(items[i:i+chunk_size]) for i in range(0, len(items), chunk_size)]

async def main():
    # 读取英文源文件
    try:
        with open(INPUT_JSON, "r", encoding="utf-8") as f:
            en_dict = json.load(f)
    except FileNotFoundError:
        print(f"❌错误： 未找到输入文件 {INPUT_JSON}")
        return

    total = len(en_dict)
    print(f"📊 待翻译条目总数: {total}")
    if total == 0:
        return

    # 检查已有翻译进度（断点续传）
    translated_all = {}
    if os.path.exists(OUTPUT_JSON):
        try:
            with open(OUTPUT_JSON, "r", encoding="utf-8") as f:
                translated_all = json.load(f)
            print(f"📌检测到 已有翻译进度: {len(translated_all)} 条")
        except:
            pass

    pending_dict = {k: v for k, v in en_dict.items() if k not in translated_all}
    if not pending_dict:
        print("✅ 所有条目已翻译完成！")
        return

    batches = chunk_dict(pending_dict, BATCH_SIZE)
    print(f"📦 待处理批次: {len(batches)} (每批最多 {BATCH_SIZE} 条)")

    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)

    connector = aiohttp.TCPConnector(limit=CONCURRENT_REQUESTS)
    async with aiohttp.ClientSession(connector=connector) as session:
        if not await wait_for_server_ready(session):
            return

        semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)

        async def process_one(batch: Dict[str, str], idx: int):
            async with semaphore:
                print(f"\n🔨 处理批次 {idx+1}/{len(batches)}，包含 {len(batch)} 条待译文本")
                print("📄 本批次原文预览:")
                for i, (k, v) in enumerate(batch.items(), 1):
                    print(f"  {i}. {v}")
                result = await translate_batch_with_retry(session, batch)
                if result:
                    translated_all.update(result)
                    # 增量写入文件
                    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
                        json.dump(translated_all, f, ensure_ascii=False, indent=2)
                    print(f"✅ 批次 {idx+1} 写入完成，总进度: {len(translated_all)}/{total}")
                else:
                    print(f"❌ 批次 {idx+1} 翻译失败，跳过")
                return result

        tasks = [process_one(batch, i) for i, batch in enumerate(batches)]
        await asyncio.gather(*tasks)

    success = len(translated_all)
    failed = total - success
    print(f"\n🎉 全部处理完毕！成功: {success} 条，失败: {failed} 条")

if __name__ == "__main__":
    asyncio.run(main())