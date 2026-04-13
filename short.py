import os
import sys
import re
import shutil

def process_ts_files(src_root: str, dst_root: str):
    """
    完整复制 src_root 到 dst_root，其中：
      - 对 .ts 和 .tsx 文件：若包含 sourceMappingURL=data: 特征串，
        则删除该注释行及其后所有内容，仅保留之前的部分。
      - 其余所有文件、目录均原样二进制复制。
    """
    src_root = os.path.abspath(src_root)
    dst_root = os.path.abspath(dst_root)

    if not os.path.isdir(src_root):
        print(f"错误：源目录不存在 {src_root}")
        return

    target_extensions = ('.ts', '.tsx')
    comment_pattern = re.compile(rb'^[ \t]*//#[ \t]*sourceMappingURL=data:', re.MULTILINE)
    marker = b'sourceMappingURL=data:'

    total = 0          # 总处理项（文件）
    modified = 0       # 已截断的 TS/TSX
    copied = 0         # 直接复制的文件（含其他类型）
    errors = 0

    for current_dir, subdirs, files in os.walk(src_root):
        # 计算相对路径并构建目标目录
        rel_dir = os.path.relpath(current_dir, src_root)
        if rel_dir == '.':
            dst_dir = dst_root
        else:
            dst_dir = os.path.join(dst_root, rel_dir)

        # 确保目标目录存在
        os.makedirs(dst_dir, exist_ok=True)

        # 处理当前目录下的所有文件
        for filename in files:
            total += 1
            src_path = os.path.join(current_dir, filename)
            dst_path = os.path.join(dst_dir, filename)
            ext = os.path.splitext(filename)[1].lower()

            try:
                # 对 TS/TSX 执行截断检查
                if ext in target_extensions:
                    with open(src_path, 'rb') as f:
                        data = f.read()

                    cut_pos = None
                    match = comment_pattern.search(data)
                    if match:
                        cut_pos = match.start()
                    else:
                        pos = data.find(marker)
                        if pos != -1:
                            cut_pos = pos

                    if cut_pos is not None:
                        new_data = data[:cut_pos]
                        modified += 1
                        reduced = len(data) - len(new_data)
                        print(f"[截断] {rel_dir}/{filename} (减少 {reduced} 字节)")
                        with open(dst_path, 'wb') as f:
                            f.write(new_data)
                    else:
                        # 没有特征串，直接复制
                        shutil.copy2(src_path, dst_path)
                        copied += 1
                        print(f"[复制] {rel_dir}/{filename}")
                else:
                    # 非 TS/TSX 文件，原样复制（保留元数据）
                    shutil.copy2(src_path, dst_path)
                    copied += 1
                    print(f"[复制] {rel_dir}/{filename}")

            except Exception as e:
                errors += 1
                print(f"[错误] {rel_dir}/{filename} : {e}", file=sys.stderr)

    print("\n===== 处理完成 =====")
    print(f"总文件数: {total}")
    print(f"已截断 TS/TSX 文件: {modified}")
    print(f"直接复制文件 (含其他类型): {copied}")
    print(f"失败文件: {errors}")
    print(f"目标目录: {dst_root}")

if __name__ == "__main__":
    src_dir = r"d:\doge-code\src"
    dst_dir = r"d:\doge-code\src5"
    process_ts_files(src_dir, dst_dir)