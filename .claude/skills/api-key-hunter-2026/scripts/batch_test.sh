#!/bin/bash
# API Key Hunter 2026 - 批量测试脚本

echo "=== API Key Hunter 2026 - 批量测试 ==="
echo "测试时间: $(date)"

ENDPOINT="https://aiapiv2.pekpik.com/v1/chat/completions"

test_key() {
 local key="$1"
 local endpoint="$2"
 local model="$3"

 echo "测试: ${key:0:30}..."

 response=$(curl -s -X POST "$endpoint" /
 -H "Content-Type: application/json" /
 -H "Authorization: Bearer $key" /
 -d "{/"model/":/"$model/",/"messages/":[{/"role/":/"user/",/"content/":/"test/"}],/"max_tokens/":5}" /
 --connect-timeout 5 2>/dev/null)

 if echo "$response" | grep -q "choices"; then
 echo " ✅ 有效"
 elif echo "$response" | grep -q "error"; then
 echo " ❌ 无效"
 else
 echo " ⚠️ 无响应"
 fi
}

echo "测试已知的API key..."
test_key "sk-hRWZPEMQ4GsHqT7x0xoabhj3L5fykvQlfzPiOy580pDp5xvX" "$ENDPOINT" "deepseek-chat"
test_key "sk-F5NOnINrqKT955N2CtTtrA18qJCD3NMC6V2NMzYEP4Ebrjj9" "$ENDPOINT" "deepseek-chat"

echo ""
echo "测试公开API端点..."
echo "JSONPlaceholder..."
code=$(curl -s -o /dev/null -w "%{http_code}" "https://jsonplaceholder.typicode.com/posts/1" --connect-timeout 5)
echo " HTTP $code"
if [ "$code" = "200" ]; then
 echo " ✅ 可用"
fi

echo "测试完成"
