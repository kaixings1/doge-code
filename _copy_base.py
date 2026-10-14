import os, shutil, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

SRC = r"D:/.github/mobile/KleanBot"
DST = r"D:/.github/mobile/viewchat"

# 删除旧目标
if os.path.isdir(DST):
    shutil.rmtree(DST)
shutil.copytree(SRC, DST)

# 包名目录重命名: dev/pegasus/kleanbot -> 保持 dev.pegasus.kleanbot (已是目标)
# 仅确认 java 目录结构
java_root = os.path.join(DST, "app", "src", "main", "java")
for dp, dns, fns in os.walk(java_root):
    for fn in fns:
        if fn.endswith(".kt"):
            p = os.path.join(dp, fn)
            t = open(p, encoding="utf-8", errors="ignore").read()
            # 已统一为 dev.pegasus.kleanbot, 无需改
print("复制完成。目标:", DST)
print("java 顶层包:", os.path.relpath(java_root, DST))
# 列出关键文件
for root, dirs, files in os.walk(os.path.join(DST, "app", "src", "main", "java")):
    for f in files:
        if f.endswith(".kt"):
            print("  " + os.path.relpath(os.path.join(root, f), DST))
