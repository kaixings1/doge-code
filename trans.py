import os
import re
import shutil
import requests
import time
from pathlib import Path
from typing import List, Tuple, Optional, Set

# ================== 配置 ==================
SOURCE_ROOT = Path(r"d:\doge-code\src2-zh2")
TARGET_ROOT = Path(r"d:\doge-code\translated")
LLAMA_URL = "http://localhost:9000/completion"
CODE_EXTS = {'.ts', '.js', '.tsx', '.jsx', '.cjs', '.mjs'}
TEMPERATURE = 0.0
MAX_RETRIES = 3
REQUEST_TIMEOUT = 300
RETRY_BACKOFF_FACTOR = 2
# ==========================================

def call_llama_translate(text: str) -> Optional[str]:
    """只翻译字符串内容，要求输出纯文本，无引号、无解释"""
    prompt = (
        "汉化，不要解释，单纯就是汉化.注释也一起汉化好 "
        "汉化，不要解释，注释也一起汉化好！.\n\n"
        f"{text}"
    )
    n_predict = max(int(len(text) * 1.5), 256)
    payload = {
        "prompt": prompt,
        "n_predict": n_predict,
        "temperature": TEMPERATURE,
        "stop": ["\n", "\"", "'", "`"],
        "stream": False,
    }

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.post(LLAMA_URL, json=payload, timeout=REQUEST_TIMEOUT * (attempt+1))
            resp.raise_for_status()
            data = resp.json()
            translated = data.get("content") or data.get("text") or data.get("response")
            if not translated:
                return None
            translated = translated.strip()
            # 去除可能包裹的引号
            if (translated.startswith('"') and translated.endswith('"')) or \
               (translated.startswith("'") and translated.endswith("'")):
                translated = translated[1:-1]
            return translated
        except Exception as e:
            print(f"翻译失败 (尝试 {attempt+1}): {e}")
            time.sleep(RETRY_BACKOFF_FACTOR ** attempt)
    return None

def extract_string_literals_advanced(content: str) -> List[Tuple[int, int, str, str]]:
    """
    使用更精确的正则提取字符串字面量，排除明显是代码关键字的上下文。
    返回 (start, end, quote_type, raw_string)
    """
    # 匹配双引号、单引号、模板字符串
    patterns = [
        (r'(?<!\\)"(?:\\.|[^"\\])*?(?<!\\)"', 'double'),
        (r"(?<!\\)'(?:\\.|[^'\\])*?(?<!\\)'", 'single'),
        (r'`(?:\\`|[^`])*?`', 'template'),
    ]
    matches = []
    for pattern, typ in patterns:
        for m in re.finditer(pattern, content):
            # 粗略排除：如果字符串前面紧跟字母或数字，可能是属性名或方法名，不翻译
            before = content[max(0, m.start()-1):m.start()]
            if before and (before.isalnum() or before == '_'):
                continue
            # 排除 import/export 语句中的模块路径（通常不应该翻译）
            line_start = content.rfind('\n', 0, m.start()) + 1
            line_prefix = content[line_start:m.start()].strip()
            if line_prefix.startswith(('import', 'export', 'require', 'from')):
                continue
            # 排除对象属性键（如 { key: "value" } 中的 key 不翻译，但 value 翻译）
            # 简单判断：如果字符串前面有冒号或等号，或者是一个单独的词，可能不是用户字符串
            # 这里放宽，仅排除上面情况
            matches.append((m.start(), m.end(), typ, m.group()))
    # 去重
    matches.sort(key=lambda x: x[0])
    filtered = []
    for m in matches:
        if not filtered or m[0] >= filtered[-1][1]:
            filtered.append(m)
    return filtered

def translate_js_file(src_path: Path, dst_path: Path) -> bool:
    """翻译 JS/TS 文件中的字符串字面量，保留其他一切"""
    try:
        with open(src_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"读取失败: {e}")
        return False

    parts = extract_string_literals_advanced(content)
    if not parts:
        # 没有需要翻译的字符串，直接复制
        try:
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_path, dst_path)
            src_path.unlink()
            print(f"无汉化内容，已复制: {dst_path}")
            return True
        except Exception as e:
            print(f"复制失败: {e}")
            return False

    # 逐个翻译字符串内容（去掉引号后翻译）
    replacements = []
    for start, end, typ, raw in parts:
        inner = raw[1:-1]  # 去掉两端引号/反引号
        if not inner.strip() or not re.search(r'[a-zA-Z]', inner):
            continue  # 空字符串或无英文，跳过
        print(f"翻译: {inner[:60]}...")
        translated = call_llama_translate(inner)
        if translated is None:
            print(f"翻译失败，保留原文")
            continue
        # 重新包装
        if typ == 'double':
            new_raw = f'"{translated}"'
        elif typ == 'single':
            new_raw = f"'{translated}'"
        else:  # template
            new_raw = f'`{translated}`'
        replacements.append((start, end, new_raw))

    # 替换（从后往前）
    new_content = content
    for start, end, new_raw in sorted(replacements, key=lambda x: x[0], reverse=True):
        new_content = new_content[:start] + new_raw + new_content[end:]

    try:
        dst_path.parent.mkdir(parents=True, exist_ok=True)
        with open(dst_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"汉化完成: {dst_path}")
        src_path.unlink()
        return True
    except Exception as e:
        print(f"写入失败: {e}")
        return False

def remove_empty_dirs(root: Path):
    for dirpath, dirnames, filenames in os.walk(root, topdown=False):
        current = Path(dirpath)
        if current == root:
            continue
        if not any(current.iterdir()):
            try:
                current.rmdir()
                print(f"删除空目录: {current}")
            except Exception as e:
                print(f"删除失败: {e}")

def main():
    if not SOURCE_ROOT.exists():
        print(f"源目录不存在: {SOURCE_ROOT}")
        return

    for src_path in SOURCE_ROOT.rglob('*'):
        if not src_path.is_file():
            continue
        rel_path = src_path.relative_to(SOURCE_ROOT)
        dst_path = TARGET_ROOT / rel_path
        print(f"\n处理文件: {src_path}")

        ext = src_path.suffix.lower()
        if ext in CODE_EXTS:
            success = translate_js_file(src_path, dst_path)
        else:
            # 非代码文件直接复制（不翻译）
            try:
                dst_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_path, dst_path)
                src_path.unlink()
                success = True
                print(f"非代码文件，已复制: {dst_path}")
            except Exception as e:
                print(f"复制失败: {e}")
                success = False

        if not success:
            print(f"处理失败，保留原文件: {src_path}")

    remove_empty_dirs(SOURCE_ROOT)
    if SOURCE_ROOT.exists() and not any(SOURCE_ROOT.iterdir()):
        SOURCE_ROOT.rmdir()
        print(f"删除顶层空目录: {SOURCE_ROOT}")

if __name__ == "__main__":
    main()