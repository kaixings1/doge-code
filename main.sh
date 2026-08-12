#!/bin/bash

# 主函数：处理用户输入循环
main() {
    echo "🚀 程序启动，输入 exit 可退出循环"
    while true; do
        # 读取用户输入
        read -p "请输入指令: " user_input
        # 判断退出条件
        if [ "$user_input" = "exit" ]; then
            echo "程序已退出"
            break
        fi
        # 处理用户输入
        echo "接收到输入: $user_input"
    done
}

# 调用主入口函数
main
