---
name: JSON 查询、筛选、转换
description: "用于 JSON 查询、筛选、转换和流水线集成的专家 jq 用法。实际 shell 工作流的实用模式。"
category: development
risk: safe
source: community
date_added: "2026-03-28"
author: kostakost2
---
# jq — JSON 查询和转换

jq 是用于查询和重塑 JSON 的标准 CLI 工具。

## 何时使用此技能

- 解析 API、CLI 工具或日志文件的 JSON 输出时
- 转换 JSON 结构时
- 在 bash 脚本或一行命令中使用 jq 时
- 解释复杂 jq 表达式时

## 基础选择

```bash
# 提取单个字段
echo '{"name":"Alice","age":30}' | jq '.name'     # "Alice"
echo '{"name":"Alice","age":30}' | jq '.age'      # 30

# 提取嵌套字段
echo '{"user":{"name":"Alice"}}' | jq '.user.name'  # "Alice"

# 提取数组元素
echo '[1,2,3]' | jq '.[0]'      # 1
echo '[1,2,3]' | jq '.[-1]'     # 3（最后一个）
echo '[1,2,3]' | jq '.[1:3]'    # [2, 3]（切片）
```

## 使用 select 筛选

```bash
# 筛选数组元素
echo '[{"name":"a","age":10},{"name":"b","age":20}]' | jq '.[] | select(.age > 15)'
# {"name":"b","age":20}

# 结合条件
cat data.json | jq '.[] | select(.status == "active" and .score > 80)'
```

## 映射和转换

```bash
# map：对数组每个元素应用变换
echo '[1,2,3]' | jq 'map(. * 2)'  # [2, 4, 6]

# 提取并转换
cat users.json | jq '[.[] | {name, upperName: (.name | ascii_upcase)}]'

# 删除字段
cat data.json | jq 'del(.password, .secret)'
```

## 聚合和归约

```bash
# 求和、计数、最大值
echo '[1,2,3,4]' | jq 'add'     # 10
echo '[1,2,3,4]' | jq 'length'  # 4
echo '[1,2,3,4]' | jq 'max'     # 4

# reduce 自定义归约
echo '[1,2,3,4]' | jq 'reduce .[] as $item (0; . + $item)'  # 10

# 分组
cat sales.json | jq 'group_by(.region) | map({region: .[0].region, total: map(.amount) | add})'
```

## 字符串插值和格式化

```bash
# 构建字符串
echo '{"name":"Alice","age":30}' | jq '"\(.name) is \(.age) years old"'
# "Alice is 30 years old"

# 格式化输出
cat data.json | jq -C '.'        # 彩色输出
cat data.json | jq '.' > out.txt # 写入文件
cat raw.json  | jq -S '.'        # 按键排序输出
cat raw.json  | jq -M '.'        # 禁用颜色
```

## 键和路径操作

```bash
# 查看所有键
echo '{"a":1,"b":{"c":2}}' | jq 'keys'          # ["a", "b"]
echo '{"a":1,"b":{"c":2}}' | jq 'paths'         # [["a"], ["b","c"]]
echo '{"a":1,"b":{"c":2}}' | jq 'keys_unsorted' # ["a", "b"]

# 添加/修改字段
echo '{"a":1}' | jq '. + {"b":2}'          # {"a":1,"b":2}
echo '{"a":1}' | jq '.a = 10'              # {"a":10}
```

## 条件语句和错误处理

```bash
# 三元运算符
echo '{"x": 5}' | jq 'if .x > 3 then "big" else "small" end'

# 默认值运算符
echo '{"name":null}' | jq '.name // "anonymous"'
echo '{"name":"Alice"}' | jq '.name // "anonymous"'

# try-catch
cat data.json | jq 'try .user.name catch "N/A"'
```

## 实际 Shell 集成

```bash
# 与 curl 配合
curl -s https://api.github.com/users/octocat | jq '.login, .name, .public_repos'

# 与 grep 配合
ps aux | jq -R 'split(" ") | select(length > 1)'

# 读取并转换文件
jq -r '.[] | "\(.name)\t\(.email)"' users.json

# 统计和处理
cat logs/*.json | jq -s 'group_by(.level) | map({level: .[0].level, count: length})'
```

## 高级模式

```bash
# 递归操作
echo '{"a":{"b":"hello"}}' | jq '.. | strings | select(test("h.*o"))'
# "hello"

# 生成 CSV
cat users.json | jq -r '[.name, .email] | @csv'
# "Alice","alice@example.com"

# 合并数组
echo '[{"a":1},{"a":2}]' | jq 'add'  # {"a":2}

# 从复杂结构提取
cat api_response.json | jq '.data.users[] | {id, name, roles: [.permissions[].name]}'
```

## 最佳实践

- 使用 `jq -r` 获取原始输出（去除引号）
- 复杂查询拆分为多个处理步骤
- 优先使用原生 jq 操作而非正则
- 大数据集用 `-c` 紧凑模式输出

## 安全注意事项

- 不要使用 `--rawfile` 或 `input(filename)` 处理不可信文件名
- 避免在 jq 中使用外部命令注入

## 常见陷阱

- `.[]` 用于迭代数组/对象，忘记会导致只返回第一项
- `null` 值选择会报错，使用 `//` 提供默认值
- 字符串匹配需正则语法，`"abc"` 是精确匹配，`"abc.*"` 是正则

## 相关技能

- `bash`：配合 shell 脚本使用
- `json-canvas`：处理 .canvas 文件结构

## 限制

- 仅处理 JSON 格式，不支持 YAML/TOML
- 大规模 JSON（>100MB）性能较差，建议专用工具
- 不支持 XML 直接转换
