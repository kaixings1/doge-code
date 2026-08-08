#!/bin/bash
# 运行所有卡死演示场景（带超时）

echo "=========================================="
echo "卡死问题排查演示 - 运行脚本"
echo "=========================================="
echo ""

# 设置超时时间（秒）
TIMEOUT=3

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

run_demo() {
    local name=$1
    local file=$2
    
    echo -e "${YELLOW}运行: $name${NC}"
    echo "文件: $file"
    echo "----------------------------------------"
    
    # 使用 timeout 命令限制运行时间
    timeout $TIMEOUT python "$file" 2>&1 || true
    
    echo ""
    echo -e "${GREEN}✓ $name 运行完成（已超时）${NC}"
    echo ""
    echo "=========================================="
    echo ""
}

# 运行所有示例
run_demo "死锁场景" "examples/deadlock_demo.py"
run_demo "无限循环场景" "examples/infinite_loop_demo.py"
run_demo "阻塞IO场景" "examples/blocking_io_demo.py"

echo ""
echo "=========================================="
echo "所有示例运行完成"
echo "=========================================="
echo ""
echo "提示："
echo "1. 程序会在 $TIMEOUT 秒后自动终止"
echo "2. 观察输出中的日志，定位卡死位置"
echo "3. 查看 README.md 了解详细的排查方法"
