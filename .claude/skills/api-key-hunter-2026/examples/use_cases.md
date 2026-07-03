# API Key Hunter 2026 - 使用示例 ## 场景1：生成测试API key
```bash
# 为不同服务生成测试key
python3 scripts/api_hunter.py generate --service openai --count 5
python3 scripts/api_hunter.py generate --service anthropic --count 3
python3 scripts/api_hunter.py generate --service deepseek --count 5 --output deepseek_keys.json
``` ## 场景2：批量测试key
```bash
# 运行批量测试脚本
bash scripts/batch_test.sh
``` ## 场景3：生成配置文件
```bash
# 为服务生成配置文件
python3 scripts/api_hunter.py config --service openai --output openai_config.json
python3 scripts/api_hunter.py config --service deepseek --output deepseek_config.json
``` ## 场景4：分析市场趋势
```bash
# 查看2026年API市场趋势
python3 scripts/api_hunter.py analyze
``` ## 场景5：查看使用摘要
```bash
# 查看所有API资源摘要
python3 scripts/api_hunter.py summary
``` ## 场景6：网络搜索API key
```bash
# 使用bash脚本搜索
bash scripts/search_online.sh "free ai api 2026"
``` ## 场景7：配置Doge Code使用
```bash
# 将找到的key配置到Doge Code
# 编辑 .doge/api.json 或使用命令
python3 scripts/api_hunter.py config --service deepseek --output .doge/deepseek_2026.json
```
