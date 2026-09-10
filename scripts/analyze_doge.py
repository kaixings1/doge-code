import os
import json

base = 'D:/doge-code/.doge'
results = []

for root, dirs, files in os.walk(base):
    for f in files:
        if f.endswith('.json'):
            full = os.path.join(root, f)
            try:
                size = os.path.getsize(full)
                rel = os.path.relpath(full, base)
                results.append((size, rel))
            except:
                pass

results.sort(reverse=True)
print(f"Total JSON files: {len(results)}")
print(f"Total size: {sum(s for s,_ in results)/1024/1024:.1f} MB")
print()
for s, rel in results[:20]:
    print(f"{s/1024:>8.1f} KB  {rel}")

# 检查index.json是否可安全删除
print("\n--- index.json check ---")
idx_path = os.path.join(base, 'index.json')
if os.path.exists(idx_path):
    try:
        with open(idx_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, dict):
            print(f"Type: dict, keys: {list(data.keys())[:10]}")
        elif isinstance(data, list):
            print(f"Type: list, length: {len(data)}")
        else:
            print(f"Type: {type(data).__name__}")
    except Exception as e:
        print(f"Parse error: {e}")
