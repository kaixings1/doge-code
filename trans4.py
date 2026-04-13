# translate_en2zh.py
import asyncio
import aiohttp
import json
import os
import re
import time
from typing import Dict, List, Optional

# ==================== 配置区域（请根据实际情况修改） ====================
API_URL = "http://localhost:9000/v1/chat/completions"   # 您的 llama-server 地址
MODEL_NAME = "local-model"
INPUT_JSON = "./public/locales/en/translation.json"
OUTPUT_JSON = "./public/locales/zh-CN/translation.json"

CONCURRENT_REQUESTS = 1          # 并发请求数，建议 ≤ llama-server 的 -np 值
BATCH_SIZE = 1                  # 每批翻译条数（若单条文本长，可减小）
REQUEST_TIMEOUT = 600            # 单个请求超时秒数
MAX_RETRIES = 3                  # 最大重试次数
RETRY_BASE_DELAY = 2             # 重试基础延迟秒数（指数退避）
TEMPERATURE = 0.1                # 温度参数，越低越稳定

VERBOSE_LOG = False              # 是否打印完整请求/响应（调试用）

SYSTEM_PROMPT = """你是一个专业的前端国际化翻译专家。请将以下英文 UI 文本翻译为自然、专业的简体中文。
要求：
1. 保持专业、简洁，符合中文软件界面的表达习惯。
2. 如果文本中包含占位符，如 {{name}} 或 %s，请原样保留它们，不要翻译。
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
4. 仅输出一个合法的 JSON 对象，key 保持不变，仅翻译 value。不要包含任何额外解释。"""
# ==================== 配置区域结束 ====================

async def wait_for_server_ready(session: aiohttp.ClientSession, max_wait: int = 120):
    """等待 llama-server 就绪，最多等待 max_wait 秒"""
    start = time.time()
    while time.time() - start < max_wait:
        try:
            async with session.get("http://localhost:9000/health") as resp:  # 若有健康检查端点
                if resp.status == 200:
                    print("服务已就绪")
                    return True
        except:
            pass
        # 若没有 /health 端点，尝试发送一个极小请求
        try:
            payload = {
                "model": MODEL_NAME,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1
            }
            async with session.post(API_URL, json=payload, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status == 200:
                    print("服务已就绪（通过小请求验证）")
                    return True
        except:
            pass
        print("等待服务就绪...")
        await asyncio.sleep(5)
    print("服务未能在规定时间内就绪，退出")
    return False

def clean_model_response(content: str) -> str:
    """
    清理模型返回的原始内容，移除 Markdown 代码块标记、首尾引号等。
    借鉴自用户脚本的清理逻辑，做适当精简。
    """
    if not content:
        return content

    # 1. 去除可能包裹的 ```json ... ``` 或 ``` ... ```
    # 先尝试提取代码块内部内容
    code_block_pattern = r'^```(?:\w+)?\s*\n(.*?)\n?```\s*$'
    match = re.search(code_block_pattern, content, re.DOTALL)
    if match:
        content = match.group(1).strip()
    else:
        # 分别处理开头和结尾的 ```
        content = re.sub(r'^```(?:\w+)?\s*\n?', '', content)
        content = re.sub(r'\n?```\s*$', '', content)

    # 2. 移除行内可能残留的独立 ``` 行
    content = re.sub(r'^\s*```\s*$', '', content, flags=re.MULTILINE)

    # 3. 移除首尾引号（模型有时会将 JSON 字符串化）
    if (content.startswith('"') and content.endswith('"')) or \
       (content.startswith("'") and content.endswith("'")):
        content = content[1:-1]

    # 4. 最终去除首尾空白
    content = content.strip()

    return content


async def translate_batch_with_retry(
    session: aiohttp.ClientSession,
    batch: Dict[str, str]
) -> Optional[Dict[str, str]]:
    """
    带重试机制的批次翻译，返回翻译后的字典。
    借鉴用户脚本的重试逻辑和超时控制。
    """
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(batch, ensure_ascii=False)}
        ],
        "temperature": TEMPERATURE,
        "max_tokens": 2048
    }

    if VERBOSE_LOG:
        print("\n" + "=" * 60)
        print(">>> 发送给模型的请求载荷 <<<")
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        print("=" * 60 + "\n")

    for attempt in range(MAX_RETRIES):
        try:
            async with session.post(
                API_URL,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
            ) as resp:
                data = await resp.json()
                choices = data.get("choices", [])
                if not choices:
                    print(f"警告：模型返回的 choices 为空，响应：{data}")
                    if attempt < MAX_RETRIES - 1:
                        await asyncio.sleep(RETRY_BASE_DELAY * (2 ** attempt))
                        continue
                    return None

                content = choices[0].get("message", {}).get("content", "")
                finish_reason = choices[0].get("finish_reason")

                if VERBOSE_LOG:
                    print("\n" + "=" * 60)
                    print("<<< 模型原始响应内容 <<<")
                    print(content)
                    print("=" * 60 + "\n")

                # 若因长度截断，增大 max_tokens 重试
                if finish_reason == "length":
                    new_max = int(payload["max_tokens"] * 1.5)
                    print(f"警告：输出被截断，将 max_tokens 从 {payload['max_tokens']} 增至 {new_max} 并重试")
                    payload["max_tokens"] = new_max
                    continue

                # 清理响应内容
                cleaned = clean_model_response(content)

                if VERBOSE_LOG:
                    print("\n" + "=" * 60)
                    print("<<< 清理后的响应内容 <<<")
                    print(cleaned)
                    print("=" * 60 + "\n")

                # 尝试解析 JSON
                try:
                    translated = json.loads(cleaned)
                    return translated
                except json.JSONDecodeError as e:
                    print(f"JSON 解析失败: {e}")
                    print(f"原始内容: {cleaned[:200]}...")
                    if attempt < MAX_RETRIES - 1:
                        await asyncio.sleep(RETRY_BASE_DELAY * (2 ** attempt))
                        continue
                    return None

        except asyncio.TimeoutError:
            print(f"请求超时 (尝试 {attempt+1}/{MAX_RETRIES})")
        except aiohttp.ClientError as e:
            print(f"网络错误 (尝试 {attempt+1}/{MAX_RETRIES}): {e}")
        except Exception as e:
            print(f"未知错误 (尝试 {attempt+1}/{MAX_RETRIES}): {e}")

        if attempt < MAX_RETRIES - 1:
            delay = RETRY_BASE_DELAY * (2 ** attempt)
            print(f"将在 {delay} 秒后重试...")
            await asyncio.sleep(delay)

    print("达到最大重试次数，放弃该批次")
    return None


def chunk_dict(data: Dict[str, str], chunk_size: int) -> List[Dict[str, str]]:
    """将大字典切割成多个小字典批次"""
    items = list(data.items())
    return [dict(items[i:i+chunk_size]) for i in range(0, len(items), chunk_size)]


async def main():
    # 读取英文源文件
    try:
        with open(INPUT_JSON, "r", encoding="utf-8") as f:
            en_dict = json.load(f)
    except FileNotFoundError:
        print(f"错误：未找到输入文件 {INPUT_JSON}")
        return

    total = len(en_dict)
    print(f"待翻译条目总数: {total}")
    if total == 0:
        print("语言包为空，无需翻译。")
        return

    # 检查是否已有部分翻译结果（可选断点续传）
    translated_all = {}
    if os.path.exists(OUTPUT_JSON):
        try:
            with open(OUTPUT_JSON, "r", encoding="utf-8") as f:
                translated_all = json.load(f)
            print(f"检测到已有翻译进度：{len(translated_all)} 条")
        except:
            pass

    # 过滤掉已翻译的条目，只处理未翻译的
    pending_dict = {k: v for k, v in en_dict.items() if k not in translated_all}
    if not pending_dict:
        print("所有条目已翻译完成，无需继续。")
        return

    batches = chunk_dict(pending_dict, BATCH_SIZE)
    print(f"待翻译批次: {len(batches)} (每批最多 {BATCH_SIZE} 条)")

    # 确保输出目录存在
    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)

    connector = aiohttp.TCPConnector(limit=CONCURRENT_REQUESTS)
    async with aiohttp.ClientSession(connector=connector) as session:
        if not await wait_for_server_ready(session):
            return

        semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)

        async def process_one(batch: Dict[str, str], idx: int):
            async with semaphore:
                print(f"正在处理批次 {idx+1}/{len(batches)}...")
                result = await translate_batch_with_retry(session, batch)
                if result:
                    # 【关键修改】每完成一个批次，立即更新内存并写入文件
                    translated_all.update(result)
                    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
                        json.dump(translated_all, f, ensure_ascii=False, indent=2)
                    print(f"批次 {idx+1} 完成，总进度: {len(translated_all)}/{total}")
                else:
                    print(f"批次 {idx+1} 翻译失败，跳过")
                return result

        tasks = [process_one(batch, i) for i, batch in enumerate(batches)]
        await asyncio.gather(*tasks)

    success = len(translated_all)
    failed = total - success
    print(f"\n全部处理完毕！最终保存至 {OUTPUT_JSON}")
    print(f"成功翻译: {success} 条")
    if failed > 0:
        print(f"失败/遗漏: {failed} 条")

if __name__ == "__main__":
    asyncio.run(main())