import os
import re
import shutil
import requests
import time
from pathlib import Path
import sys
from typing import List, Optional
import signal

# ================== 配置 ==================
SOURCE_ROOT = Path(r"d:\doge-code\src2-zh2")
TARGET_ROOT = Path(r"d:\doge-code\translated")
LLAMA_URL = "http://localhost:9000/v1/chat/completions"   # 保留 /v1 前缀
TEMPERATURE = 0.20
MAX_RETRIES = 3
REQUEST_TIMEOUT = 800
RETRY_DELAY = 2
CHUNK_SIZE = 1024*3
# ==========================================

should_exit = False

def signal_handler(sig, frame):
    global should_exit
    print("\n收到中断信号，正在退出...")
    should_exit = True
    sys.exit(130)

def needs_translation(text: str) -> bool:
    """检查文本中是否有需要翻译的英文注释或字符串字面量"""
    # 匹配注释中的英文（至少连续两个字母）
    if re.search(r'//.*[a-zA-Z]{2,}', text):
        return True
    if re.search(r'/\*.*[a-zA-Z]{2,}.*\*/', text, re.DOTALL):
        return True
    # 匹配字符串字面量中的英文（不包含 import/from 路径中的斜杠）
    for line in text.splitlines():
        # 跳过 import 行（这些路径不需要翻译）
        if line.strip().startswith(('import', 'export')):
            continue
        # 粗略检测字符串中的英文
        if re.search(r'["\'`][^"\'`]*[a-zA-Z]{2,}[^"\'`]*["\'`]', line):
            return True
    return False

signal.signal(signal.SIGINT, signal_handler)

def align_indentation(original: str, translated: str) -> str:
    """将翻译结果的行缩进与原版代码保持一致"""
    orig_lines = original.splitlines(keepends=True)
    trans_lines = translated.splitlines(keepends=True)
    aligned_lines = []
    max_lines = max(len(orig_lines), len(trans_lines))
    for i in range(max_lines):
        orig_line = orig_lines[i] if i < len(orig_lines) else ""
        trans_line = trans_lines[i] if i < len(trans_lines) else ""
        if not orig_line or not trans_line:
            # 某一方行数不足，直接保留翻译行
            aligned_lines.append(trans_line if trans_line else "")
            continue
        # 提取原版前导空白（空格和制表符）
        match = re.match(r'^[\t ]*', orig_line)
        orig_indent = match.group(0) if match else ""
        # 去除翻译行的前导空白
        trans_stripped = trans_line.lstrip('\t ')
        # 拼接：原版缩进 + 翻译内容（保留原翻译行末尾换行符）
        new_line = orig_indent + trans_stripped
        # 保持原翻译行的换行符（如果原翻译行没有换行，但原版有？简单处理：保留翻译行的换行符）
        aligned_lines.append(new_line)
    return ''.join(aligned_lines)
    
def call_llama_translate(text: str) -> Optional[str]:
    """翻译文本块，使用 chat/completions 接口"""
    if not text.strip():
        return text
    if not re.search(r'[a-zA-Z]', text):
        return text

    system_msg = (
        "You are a code translator. Translate ONLY English comments and string literals in TypeScript/JavaScript code into Chinese. "
        "Keep all code syntax, keywords, variable names, import paths unchanged. Do NOT wrap the translated code in ``` ... ```. Output only the raw code. Do NOT output any special tokens like <|end▁of▁sentence|> or <|eot_id|>. "
        "Only translate inside comments (//, /* */) and string literals (\"\", '', ``). "
        "Do NOT add, remove, or reorder any code. "
        "Do NOT output any explanation or extra text. "
        "Do NOT use Markdown code fences (no ```). "
        "If you cannot translate something (e.g., ambiguous meaning, technical term), leave it exactly as the original, do NOT drop or concatenate incorrectly. "
        "Ensure the translated code has the same number of lines and indentation format as the original. "
        "Do NOT translate the string literal 'logForDebugging' — keep it exactly as 'logForDebugging'. "
        "另外补充: 汉化，不要解释，单纯就是汉化，不是全文翻译！！！"
    )
    user_msg = f"需要汉化的内容是:\n{text}"

    messages = [
        {"role": "system", "content": system_msg},
        {"role": "user", "content": user_msg}
    ]

    # 增大 max_tokens 缓冲区，避免截断
    max_tokens = max(int(len(text) * 2), 2048)

    payload = {
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": TEMPERATURE,
        "stop": ["\n\n\n"],   # 简化 stop 序列，避免误触发
        "stream": False,
    }

    # ========== 打印完整的请求 ==========
    print("\n" + "="*60)
    print(">>> 发送给模型的完整请求 (chat/completions) <<<")
    print("="*60)
    print(payload)
    print("="*60 + "\n")

    for attempt in range(MAX_RETRIES):
        if should_exit:
            sys.exit(130)
        try:
            resp = requests.post(LLAMA_URL, json=payload, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            choices = data.get("choices", [])
            if not choices:
                print("警告：模型返回的 choices 为空")
                print(f"完整 AI 响应：{data}")
                return None
            finish_reason = choices[0].get("finish_reason")
            message = choices[0].get("message", {})
            translated = message.get("content")
            reasoning = message.get("reasoning_content", "")

            # 处理空 content 但有 reasoning 的情况（DeepSeek-R1 认为无需翻译）
            if not translated and reasoning:
                print("模型推理：无需翻译内容，保留原文")
                return text

            if not translated:
                print("警告：模型返回内容为空")
                print(f"完整 AI 响应：{data}")
                print("模型判断无可翻译内容，保留原文")
                return text

            translated = translated.strip()

            # 若因长度限制截断，则增大 max_tokens 重试
            if finish_reason == "length":
                print("警告：输出因 max_tokens 限制被截断，将增大 token 限制并重试")
                payload["max_tokens"] = int(payload["max_tokens"] * 1.5)
                continue

            # ========== 打印完整响应 ==========
            print("\n" + "="*60)
            print("<<< 模型返回的完整响应 <<<")
            print("="*60)
            print(translated)
            print("="*60 + "\n")
            if (translated.startswith('"') and translated.endswith('"')) or (translated.startswith("'") and translated.endswith("'")):
                translated = translated[1:-1]
            #translated = re.sub(r'<\|[^>]*\|>', '', translated)
            #translated = re.sub(r'<\|end▁of▁sentence\|>', '', translated)   # 这是您看到的格式
            #translated = re.sub(r'<\|eot_id\|>', '', translated)             # 其他常见格式
            #translated = re.sub(r'<\|endoftext\|>', '', translated)          # GPT 风格
            #translated = re.sub(r'<｜end▁of▁sentence｜>', '', translated)   # 您遇到的格式（注意全角竖线）
            # 后处理：移除可能的引号和代码块标记
            #translated = re.sub(r'^["\']|["\']$', '', translated)
            translated = re.sub(r'^```\w*\s*\n?', '', translated)
            translated = re.sub(r'\n?```\s*$', '', translated)
            translated = re.sub(r'\n\s*```\s*\n', '\n', translated)
            #translated = re.sub(r'```$', '', translated)
            
            # 后处理：移除可能的代码块标记（整个代码块）
            # 如果整个响应被包裹在 ``` ... ``` 中，则提取内部内容
            if translated.startswith('```') and translated.endswith('```'):
                # 移除开头的 ``` 及可选的编程语言标识（如 ```typescript）
                translated = re.sub(r'^```\w*\s*\n?', '', translated)
                # 移除结尾的 ``` 及前面的换行
                translated = re.sub(r'\n?```\s*$', '', translated)
            else:
                # 如果只有开头或结尾不匹配，则分别处理
                translated = re.sub(r'^```\w*\s*\n?', '', translated)
                translated = re.sub(r'\n?```\s*$', '', translated)

            # 额外：移除可能残留的独立 ``` 行（如代码块内的错误格式）
            translated = re.sub(r'^\s*```\s*$', '', translated, flags=re.MULTILINE)
            # 移除首尾引号（模型有时会输出字符串化的代码）
            translated = re.sub(r'^["\']|["\']$', '', translated)
            # 最终 strip 一下
            lines = translated.splitlines()
            while lines and lines[0].strip().startswith('```'):
                lines.pop(0)
            while lines and lines[-1].strip() == '```':
                lines.pop()
            if lines and lines[-1].strip().startswith('```'):
                lines.pop()
            translated = '\n'.join(lines)
            # 3. 正则清理行内可能残留的 ```（如开头或结尾的）
            translated = re.sub(r'^```\w*\s*\n?', '', translated)
            translated = re.sub(r'\n?```\s*$', '', translated)
            translated = re.sub(r'\n\s*```\s*\n', '\n', translated)            
            # 4. 移除首尾引号
            translated = re.sub(r'^["\']|["\']$', '', translated)            
            # 5. 再次去除可能出现的单独 ``` 行（因为上一步重新组合后可能有新行）
            translated = re.sub(r'^```\s*$', '', translated, flags=re.MULTILINE)
            translated = re.sub(r'```\s*$', '', translated, flags=re.MULTILINE)            
            # 6. 清理首尾空白
            translated = translated.strip()
            if (translated.startswith('"') and translated.endswith('"')) or (translated.startswith("'") and translated.endswith("'")):
                translated = translated[1:-1]
            
            # ========== 打印最终清理后的响应 ==========
            print("\n" + "="*60)
            print("<<< 模型返回的完整响应（已清理代码块标记） <<<")
            print("="*60)
            print(translated)
            print("="*60 + "\n")
            aligned = align_indentation(text, translated)
            return aligned
        except KeyboardInterrupt:
            sys.exit(130)
        except Exception as e:
            print(f"汉化失败 (尝试 {attempt+1}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
    return None

def chunk_by_lines(content: str, max_chunk_size: int, min_last_line_len: int = 10) -> List[str]:
    """
    按行切分，每个块尽量接近 max_chunk_size，但确保每个块的最后一行长度 >= min_last_line_len
    若最后一行过短，则继续吸收下一行（即使超出 max_chunk_size），避免孤立的短行
    """
    lines = content.splitlines(keepends=True)
    chunks = []
    i = 0
    n = len(lines)
    while i < n:
        current_chunk = []
        current_len = 0
        # 累积直到超过 max_chunk_size 或者没有下一行
        while i < n:
            line = lines[i]
            line_len = len(line)
            # 如果加上这一行会超出限制，但当前 chunk 不为空
            if current_len + line_len > max_chunk_size and current_chunk:
                # 检查当前 chunk 最后一行长度是否过短
                last_line = current_chunk[-1]
                if len(last_line.rstrip('\n\r')) < min_last_line_len and i < n:
                    # 最后一行太短，强制吞并下一行（即使超出大小）
                    # 但需要避免无限循环，直接添加下一行并继续
                    current_chunk.append(line)
                    current_len += line_len
                    i += 1
                    # 吞并后继续循环，不再跳出
                    continue
                else:
                    # 最后一行足够长，结束当前 chunk
                    break
            # 未超出限制，正常添加
            current_chunk.append(line)
            current_len += line_len
            i += 1
        # 将当前 chunk 加入结果
        chunks.append(''.join(current_chunk))
    return chunks

def remove_duplicate_blocks(content: str, min_repeat_lines: int = 3) -> str:
    """简单去重：删除连续重复的段落（由两个以上换行符分隔）"""
    paragraphs = re.split(r'\n\s*\n', content)
    cleaned = []
    for para in paragraphs:
        if not cleaned or para != cleaned[-1]:
            cleaned.append(para)
    return '\n\n'.join(cleaned)

def translate_file(src_path: Path, dst_path: Path) -> bool:
    """分块汉化文件，每翻译完一个块立即写入目标文件（块间自动添加换行）"""
    try:
        with open(src_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"读取文件失败 {src_path}: {e}")
        return False

    # 确保目标目录存在，并清空目标文件
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    with open(dst_path, 'w', encoding='utf-8') as f:
        pass  # 清空文件

    if len(content) <= CHUNK_SIZE:
        if needs_translation(content):
            translated = call_llama_translate(content)
            if translated is None:
                print(f"汉化失败，保留原文件")
                return False
            new_content = translated
        else:
            new_content = content
        # 写入最终内容
        with open(dst_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        # 确保文件末尾有换行（可选）
        with open(dst_path, 'a', encoding='utf-8') as f:
            if not new_content.endswith('\n'):
                f.write('\n')
        print(f"汉化完成: {dst_path}")
        src_path.unlink()
        return True
    else:
        chunks = chunk_by_lines(content, CHUNK_SIZE)
        for i, chunk in enumerate(chunks):
            print(f"\n汉化块 {i+1}/{len(chunks)} (大小: {len(chunk)} 字符)")
            if not needs_translation(chunk):
                translated_chunk = chunk
            else:
                translated = call_llama_translate(chunk)
                if translated is None:
                    print(f"块 {i+1} 汉化失败，使用原文")
                    translated_chunk = chunk
                else:
                    translated_chunk = translated
            # 追加写入，并在块末尾添加换行（防止粘连）
            with open(dst_path, 'a', encoding='utf-8') as f:
                f.write(translated_chunk)
                # 如果块末尾不是换行，则添加一个换行
                if not translated_chunk.endswith('\n'):
                    f.write('\n')
            print(f"块 {i+1} 已写入")
        # 所有块写入完成后，对最终文件进行去重处理（可选）
        # f.write('\n')
        with open(dst_path, 'r', encoding='utf-8') as f:
            final_content = f.read()
        cleaned = remove_duplicate_blocks(final_content)
        if cleaned != final_content:
            with open(dst_path, 'w', encoding='utf-8') as f:
                f.write(cleaned)
            print(f"已对最终文件进行去重处理")
        print(f"汉化完成: {dst_path}")
        src_path.unlink()
        return True

def remove_empty_dirs(root: Path):
    """递归删除空目录"""
    for dirpath, dirnames, filenames in os.walk(root, topdown=False):
        current = Path(dirpath)
        if current == root:
            continue
        if not any(current.iterdir()):
            try:
                current.rmdir()
                print(f"删除空目录: {current}")
            except Exception as e:
                print(f"删除失败 {current}: {e}")

def main():
    if not SOURCE_ROOT.exists():
        print(f"源目录不存在: {SOURCE_ROOT}")
        return

    extensions = {'.ts', '.tsx', '.js', '.jsx', '.txt', '.md'}
    for src_path in SOURCE_ROOT.rglob('*'):
        if not src_path.is_file():
            continue
        if src_path.suffix.lower() not in extensions:
            continue

        rel_path = src_path.relative_to(SOURCE_ROOT)
        dst_path = TARGET_ROOT / rel_path
        print(f"\n处理文件: {src_path}")
        success = translate_file(src_path, dst_path)
        if not success:
            print(f"处理失败，保留原文件: {src_path}")

    remove_empty_dirs(SOURCE_ROOT)
    if SOURCE_ROOT.exists() and not any(SOURCE_ROOT.iterdir()):
        SOURCE_ROOT.rmdir()
        print(f"已删除顶层空目录: {SOURCE_ROOT}")

    print("\n所有文件处理完毕。")

if __name__ == "__main__":
    main()