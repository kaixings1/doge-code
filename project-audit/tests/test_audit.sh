#!/bin/bash
# 测试脚本

echo "运行审计工具测试..."

# 测试1: 检查脚本是否存在
if [ -f "../src/audit.sh" ]; then
    echo "[PASS] 主脚本存在"
else
    echo "[FAIL] 主脚本不存在"
    exit 1
fi

# 测试2: 检查配置文件
if [ -f "../config/audit.conf" ]; then
    echo "[PASS] 配置文件存在"
else
    echo "[FAIL] 配置文件不存在"
    exit 1
fi

echo "所有测试通过"
