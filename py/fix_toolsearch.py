import re

file_path = 'src/tools/ToolSearchTool/prompt.ts'

with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# 替换 PROMPT_TAIL 的英文为中文
old_pattern = r' Until fetched, only the name is known.*?rank by remaining terms'

new_text = ' 在获取之前只知道名称 —— 没有参数模式，因此无法调用该工具。此工具接受查询，与延迟工具列表匹配，并在 functions 块内返回匹配工具的完整 JSONSchema 定义。一旦工具的模式出现在结果中，它就可以像提示顶部的任何工具一样调用。\n\n结果格式：每个匹配的工具以 function 行出现在 functions 块内 —— 与此提示顶部的工具列表相同的编码。\n\n查询形式：\n- "select:Read,Edit,Grep" —— 按名称获取这些精确的工具\n- "notebook jupyter" —— 关键字搜索最多 max_results 个最佳匹配\n- "+slack send" —— 要求名称中包含 slack，按剩余术语排序'

content = re.sub(old_pattern, new_text, content, flags=re.DOTALL)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed ToolSearchTool/prompt.ts')
