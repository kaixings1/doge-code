# translate_en2zh.py
import asyncio
import aiohttp
import json
import os
from typing import Dict, List

# ========== 配置区域（请根据实际情况修改） ==========
API_URL = "http://localhost:9000/v1/chat/completions"
MODEL_NAME = "local-model"  # llama-server 不严格校验此字段
INPUT_JSON = "./public/locales/en/translation.json"
OUTPUT_JSON = "./public/locales/zh-CN/translation.json"

CONCURRENT_REQUESTS = 8   # 并发请求数，建议与 llama-server 的 -np 值一致
BATCH_SIZE = 10           # 每批翻译多少条（如果单条文本较长，可减小此值）

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
# ========== 配置区域结束 ==========

async def translate_batch(session: aiohttp.ClientSession, 
                          batch: Dict[str, str]) -> Dict[str, str]:
    """发送一个批次到 llama-server 并返回翻译后的 dict"""
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(batch, ensure_ascii=False)}
        ],
        "temperature": 0.1,
        "max_tokens": 2048
    }
    
    try:
        async with session.post(API_URL, json=payload, timeout=aiohttp.ClientTimeout(total=120)) as resp:
            data = await resp.json()
            content = data["choices"][0]["message"]["content"]
            # 清理可能包裹的 Markdown 标记
            content = content.strip()
            if content.startswith("```json"):
                content = content[7:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            return json.loads(content)
    except Exception as e:
        print(f"翻译批次出错: {e}")
        return {}

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
        print("请确保已运行 `npx i18next-cli extract` 生成英文语言包。")
        return

    total = len(en_dict)
    print(f"待翻译条目总数: {total}")
    
    if total == 0:
        print("语言包为空，无需翻译。")
        return

    batches = chunk_dict(en_dict, BATCH_SIZE)
    print(f"分割为 {len(batches)} 个批次，每批最多 {BATCH_SIZE} 条")
    
    translated_all = {}
    connector = aiohttp.TCPConnector(limit=CONCURRENT_REQUESTS)
    
    async with aiohttp.ClientSession(connector=connector) as session:
        semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
        
        async def process_one(batch: Dict[str, str], idx: int):
            async with semaphore:
                print(f"正在处理批次 {idx+1}/{len(batches)}...")
                return await translate_batch(session, batch)
        
        tasks = [process_one(batch, i) for i, batch in enumerate(batches)]
        results = await asyncio.gather(*tasks)
        
        for res in results:
            if res:
                translated_all.update(res)
    
    # 确保输出目录存在
    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    
    # 保存中文语言包
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(translated_all, f, ensure_ascii=False, indent=2)
    
    success = len(translated_all)
    failed = total - success
    print(f"\n翻译完成！已保存至 {OUTPUT_JSON}")
    print(f"成功翻译: {success} 条")
    if failed > 0:
        print(f"失败/遗漏: {failed} 条，请检查上方错误日志。")

if __name__ == "__main__":
    asyncio.run(main())