#!/bin/bash
# API Key Hunter 2026 - 在线搜索脚本
# 用于从各个来源搜索可用的API key echo "=== 开始在线搜索API key ==="
echo "搜索时间: $(date)"
echo "================================" SEARCH_TERM="${1:-'free api key 2026'}" echo ""
echo "1. 搜索GitHub..."
echo " 搜索词: $SEARCH_TERM"
curl -s "https://api.github.com/search/repositories?q=${SEARCH_TERM// /+}&sort=updated&order=desc&per_page=5" / -H "User-Agent: APIKeyHunter2026" | python3 -c "
import sys, json
try: data = json.load(sys.stdin) items = data.get('items', []) for item in items[:5]: print(f' - {item[/"full_name/"]}: {item.get(/"description/", /"/")[:80]}')
except: pass
" 2>/dev/null || echo " 搜索失败" echo ""
echo "2. 搜索公开Gist..."
curl -s "https://api.github.com/gists/public?per_page=10" / -H "User-Agent: APIKeyHunter2026" | python3 -c "
import sys, json
try: items = json.load(sys.stdin) for item in items[:5]: desc = item.get('description', '') if desc: print(f' - {desc[:80]}') print(f' 链接: {item[/"html_url/"]}')
except: pass
" 2>/dev/null || echo " 搜索失败" echo ""
echo "3. 测试公开API服务..."
echo " a) JSONPlaceholder..."
code=$(curl -s -o /dev/null -w "${http_code}" "https://jsonplaceholder.typicode.com/posts/1" --connect-timeout 5)
echo " HTTP $code" echo " b) Public APIs..."
code2=$(curl -s -o /dev/null -w "{http_code}" "https://api.publicapis.org/health" --connect-timeout 5)
echo " HTTP $code2" echo ""
echo "4. 搜索到的免费资源："
echo " - OpenRouter免费模型: https://openrouter.ai/keys"
echo " - JSONPlaceholder: https://jsonplaceholder.typicode.com/"
echo " - Public APIs: https://api.publicapis.org/"
echo " - DeepSeek免费额度: https://platform.deepseek.com/"
echo " - 百度文心免费: https://yiyan.baidu.com/developer" echo ""
echo "================================"
echo "搜索完成"
